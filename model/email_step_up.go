package model

import (
	"crypto/hmac"
	"errors"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	// AuthFlowPurposeEmailStepUp labels a security-verification code mailed to
	// the account's own address. A user holds at most one live code: issuing a
	// new one spends the earlier ones.
	AuthFlowPurposeEmailStepUp = "email_step_up"
	EmailStepUpTTL             = 10 * time.Minute
	EmailStepUpResendDelay     = time.Minute
	// EmailStepUpMaxAttempts burns a code after that many wrong guesses, and
	// EmailStepUpMaxPerHour bounds how many codes one account can be sent. Both
	// count auth_flows rows, so a restart or a second server grants no new budget.
	EmailStepUpMaxAttempts = 5
	EmailStepUpMaxPerHour  = 10
)

var ErrEmailStepUpCodeInvalid = errors.New("The email verification code is incorrect or has expired.")

// EmailStepUpState is server-owned payload. It binds the code to the operation
// it authorizes and to the address it was mailed to; it never holds the code.
type EmailStepUpState struct {
	Scope       string `json:"scope"`
	ContextHash string `json:"context_hash"`
	Email       string `json:"email"`
	CodeHash    string `json:"code_hash"`
	Attempts    int    `json:"attempts,omitempty"`
}

// emailStepUpCodeHash keys the code with the session secret and binds it to the
// user, so a database copy alone cannot be searched for the six digits.
func emailStepUpCodeHash(userID int, code string) string {
	return common.GenerateHMACWithKey([]byte("email-step-up-code-v1:"+common.SessionSecret), strconv.Itoa(userID)+":"+code)
}

// CreateEmailStepUp records a new code for the session's user and spends every
// earlier one. It refuses while the previous code is younger than the resend
// delay or the hourly budget is used. The returned flow carries the deadline.
func CreateEmailStepUp(identity AuthSessionIdentity, scope, contextHash, email, code string) (*AuthFlow, error) {
	email = NormalizeEmail(email)
	if scope == "" || contextHash == "" || email == "" || len(code) != 6 {
		return nil, ErrAuthFlowInvalid
	}
	payload, err := common.Marshal(EmailStepUpState{
		Scope: scope, ContextHash: contextHash, Email: email, CodeHash: emailStepUpCodeHash(identity.UserID, code),
	})
	if err != nil {
		return nil, err
	}
	var flow *AuthFlow
	err = DB.Transaction(func(tx *gorm.DB) error {
		// The user row lock taken here serializes concurrent sends for one account.
		if err := ValidateAuthSessionWithTx(tx, identity); err != nil {
			return err
		}
		now := time.Now()
		var recent []AuthFlow
		if err := tx.Select("id", "created_at").
			Where("purpose = ? AND user_id = ? AND created_at >= ?", AuthFlowPurposeEmailStepUp, identity.UserID, now.Add(-time.Hour)).
			Order("id desc").Find(&recent).Error; err != nil {
			return err
		}
		if len(recent) >= EmailStepUpMaxPerHour || len(recent) > 0 && recent[0].CreatedAt.After(now.Add(-EmailStepUpResendDelay)) {
			return ErrEmailBindingResendWait
		}
		if err := tx.Model(&AuthFlow{}).
			Where("purpose = ? AND user_id = ? AND consumed_at IS NULL", AuthFlowPurposeEmailStepUp, identity.UserID).
			Update("consumed_at", now).Error; err != nil {
			return err
		}
		_, flow, err = createAuthFlowWithTx(tx, AuthFlowCreate{
			Purpose: AuthFlowPurposeEmailStepUp, UserId: identity.UserID, SessionId: identity.SessionID,
			Payload: string(payload), ExpiresAt: now.Add(EmailStepUpTTL),
		})
		return err
	})
	if err != nil {
		return nil, err
	}
	return flow, nil
}

// CancelEmailStepUp spends a code whose mail could not be delivered.
func CancelEmailStepUp(flowID int64) error {
	return DB.Model(&AuthFlow{}).Where("id = ? AND consumed_at IS NULL", flowID).Update("consumed_at", time.Now()).Error
}

// ConsumeEmailStepUp spends the session's live code when it matches and was
// issued for the same operation. A wrong code counts against it and the last
// allowed miss spends it; that count commits even though the call fails.
// A code issued to another session, for another operation, to an address the
// account no longer holds, after its deadline, or already spent is refused
// with ErrEmailStepUpCodeInvalid.
func ConsumeEmailStepUp(identity AuthSessionIdentity, scope, contextHash, code string) error {
	if _, err := strconv.Atoi(code); err != nil || len(code) != 6 {
		return ErrEmailStepUpCodeInvalid
	}
	var verificationError error
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := ValidateAuthSessionWithTx(tx, identity); err != nil {
			return err
		}
		var flow AuthFlow
		err := tx.Where("purpose = ? AND user_id = ? AND session_id = ? AND consumed_at IS NULL AND expires_at > ?",
			AuthFlowPurposeEmailStepUp, identity.UserID, identity.SessionID, time.Now()).
			Order("id desc").First(&flow).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			verificationError = ErrEmailStepUpCodeInvalid
			return nil
		}
		if err != nil {
			return err
		}
		var state EmailStepUpState
		if err := common.UnmarshalJsonStr(flow.Payload, &state); err != nil || state.CodeHash == "" {
			verificationError = ErrEmailStepUpCodeInvalid
			return nil
		}
		var user User
		if err := tx.Select("email").First(&user, identity.UserID).Error; err != nil {
			return err
		}
		// Every write below is a compare-and-swap on the payload that was read, so
		// two concurrent guesses cannot share one attempt or both succeed.
		live := tx.Model(&AuthFlow{}).Where("id = ? AND payload = ? AND consumed_at IS NULL", flow.Id, flow.Payload)
		if state.Scope == scope && hmac.Equal([]byte(state.ContextHash), []byte(contextHash)) &&
			state.Email == NormalizeEmail(user.Email) &&
			hmac.Equal([]byte(state.CodeHash), []byte(emailStepUpCodeHash(identity.UserID, code))) {
			result := live.Update("consumed_at", time.Now())
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				verificationError = ErrEmailStepUpCodeInvalid
			}
			return nil
		}
		state.Attempts++
		payload, err := common.Marshal(state)
		if err != nil {
			return err
		}
		updates := map[string]any{"payload": string(payload)}
		if state.Attempts >= EmailStepUpMaxAttempts {
			updates["consumed_at"] = time.Now()
		}
		verificationError = ErrEmailStepUpCodeInvalid
		return live.Updates(updates).Error
	})
	if err != nil {
		return err
	}
	return verificationError
}
