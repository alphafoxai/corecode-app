package model

import (
	"crypto/hmac"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	// MagicLinkPurpose labels one-time email sign-in links inside auth_flows.
	// The normalized address goes in Provider and the issuing client address in
	// SessionId, so both throttle dimensions reuse existing indexed columns.
	MagicLinkPurpose      = "magic_link"
	MagicLinkTTL          = 10 * time.Minute
	MagicLinkSendInterval = time.Minute
	// MagicLinkEmailMaxLen matches service.ValidateAccountEmail's own bound. It stays
	// under the auth_flows.provider column the address is stored in.
	MagicLinkEmailMaxLen = 50
	MagicLinkIPPrefix    = "ip:"

	// MagicLinkMaxPerEmail bounds one mailbox against a spam caller and
	// MagicLinkMaxPerIP bounds one client address across mailboxes. Both count
	// auth_flows rows, so a restart cannot hand a throttled caller a new budget.
	MagicLinkMaxPerEmail = 10
	MagicLinkMaxPerIP    = 20
	MagicLinkWindow      = time.Hour

	magicLinkRedirectMaxLen = 200
	// MagicLinkAffMaxLen matches the users.aff_code column an invite code
	// is looked up in.
	MagicLinkAffMaxLen = 32

	// MagicLinkCodeMaxAttempts burns a link after that many wrong codes. With six
	// digits and the per-mailbox send cap, a guesser gets at most 50 tries an hour
	// against a million codes.
	MagicLinkCodeDigits      = 6
	MagicLinkCodeMaxAttempts = 5
)

var ErrMagicLinkRegistrationDisabled = errors.New("magic link registration is disabled")

// MagicLinkState is server-owned payload. It carries the address the link was
// issued for, so consumption needs nothing but the opaque token and the link URL
// leaks no account identifier.
//
// CodeHash is the keyed hash of the code mailed beside the link, and Attempts
// counts wrong codes. A link issued before codes existed has no CodeHash and
// signs in only through its URL.
//
// Aff is the invite code the requester arrived with. It binds an inviter only
// if the link registers a new account.
type MagicLinkState struct {
	Email    string `json:"email"`
	IP       string `json:"ip,omitempty"`
	CodeHash string `json:"code_hash,omitempty"`
	Attempts int    `json:"attempts,omitempty"`
	Aff      string `json:"aff,omitempty"`
}

// CreateMagicLink issues a single-use sign-in link for an email address and
// returns the opaque token, the code mailed beside it, and the instant both stop
// working. The token and the code open the same row, so using either spends
// both.
//
// Issuing consumes every earlier link for the same mailbox. One mailbox
// therefore holds at most one live link: an older message in the inbox cannot
// sign in after a newer request, and two live links can never race into two
// accounts. Superseded rows stay counted, so the send throttle measures every
// link actually issued rather than only the survivors.
func CreateMagicLink(email, clientIP, aff string) (string, string, time.Time, error) {
	email = NormalizeEmail(email)
	if email == "" || len(email) > MagicLinkEmailMaxLen {
		return "", "", time.Time{}, ErrAuthFlowInvalid
	}
	aff = strings.TrimSpace(aff)
	if len(aff) > MagicLinkAffMaxLen {
		aff = ""
	}
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", "", time.Time{}, fmt.Errorf("generate magic link code: %w", err)
	}
	code := fmt.Sprintf("%0*d", MagicLinkCodeDigits, n.Int64())
	payload, err := common.Marshal(MagicLinkState{Email: email, IP: clientIP, CodeHash: magicLinkCodeHash(email, code), Aff: aff})
	if err != nil {
		return "", "", time.Time{}, err
	}
	var token string
	var flow *AuthFlow
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockNormalizedEmail(tx, email); err != nil {
			return err
		}
		if err := tx.Model(&AuthFlow{}).
			Where("purpose = ? AND provider = ? AND consumed_at IS NULL", MagicLinkPurpose, email).
			Update("consumed_at", time.Now()).Error; err != nil {
			return err
		}
		token, flow, err = createAuthFlowWithTx(tx, AuthFlowCreate{
			Purpose:   MagicLinkPurpose,
			Provider:  email,
			SessionId: MagicLinkIPPrefix + clientIP,
			Payload:   string(payload),
			ExpiresAt: time.Now().Add(MagicLinkTTL),
		})
		return err
	})
	if err != nil {
		return "", "", time.Time{}, err
	}
	return token, code, flow.ExpiresAt, nil
}

// magicLinkCodeHash keys the code with the session secret and binds it to the
// address, so a database copy alone cannot be searched for the six digits.
func magicLinkCodeHash(email, code string) string {
	return common.GenerateHMACWithKey([]byte("magic-link-code-v1:"+common.SessionSecret), email+":"+code)
}

// ConsumeMagicLinkCode spends the live link of an address when code matches the
// one mailed with it, and returns the link's state with the address
// normalized. A wrong code counts against the link, and the last allowed miss
// spends it.
//
// Every write is a compare-and-swap on the payload that was read, so concurrent
// guesses cannot share one attempt: a guess whose write loses counts as wrong.
// No live link, a link without a code, a wrong code, and a lost race all return
// ErrAuthFlowInvalid.
func ConsumeMagicLinkCode(email, code string) (MagicLinkState, error) {
	email = NormalizeEmail(email)
	code = strings.TrimSpace(code)
	if email == "" || len(email) > MagicLinkEmailMaxLen || len(code) != MagicLinkCodeDigits {
		return MagicLinkState{}, ErrAuthFlowInvalid
	}
	now := time.Now()
	var flow AuthFlow
	err := DB.Where("purpose = ? AND provider = ? AND consumed_at IS NULL AND expires_at > ?", MagicLinkPurpose, email, now).
		Order("id desc").First(&flow).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return MagicLinkState{}, ErrAuthFlowInvalid
	}
	if err != nil {
		return MagicLinkState{}, err
	}
	var state MagicLinkState
	if err := common.UnmarshalJsonStr(flow.Payload, &state); err != nil || state.CodeHash == "" {
		return MagicLinkState{}, ErrAuthFlowInvalid
	}
	live := DB.Model(&AuthFlow{}).Where("id = ? AND payload = ? AND consumed_at IS NULL", flow.Id, flow.Payload)
	if hmac.Equal([]byte(state.CodeHash), []byte(magicLinkCodeHash(email, code))) {
		result := live.Update("consumed_at", now)
		if result.Error != nil {
			return MagicLinkState{}, result.Error
		}
		if result.RowsAffected != 1 {
			return MagicLinkState{}, ErrAuthFlowInvalid
		}
		state.Email = email
		return state, nil
	}
	state.Attempts++
	payload, err := common.Marshal(state)
	if err != nil {
		return MagicLinkState{}, err
	}
	updates := map[string]any{"payload": string(payload)}
	if state.Attempts >= MagicLinkCodeMaxAttempts {
		updates["consumed_at"] = now
	}
	if err := live.Updates(updates).Error; err != nil {
		return MagicLinkState{}, err
	}
	return MagicLinkState{}, ErrAuthFlowInvalid
}

// MagicLinkLastSentAt reports when a link was last issued for an address; the
// zero time means none was ever issued.
func MagicLinkLastSentAt(email string) (time.Time, error) {
	var flow AuthFlow
	err := DB.Where("purpose = ? AND provider = ?", MagicLinkPurpose, NormalizeEmail(email)).
		Order("id desc").First(&flow).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return time.Time{}, nil
	}
	if err != nil {
		return time.Time{}, err
	}
	return flow.CreatedAt, nil
}

// CountMagicLinksSince counts issued links within the window for one mailbox
// (email non-empty) or one client address (clientIP non-empty), including links
// that were later superseded or already spent.
func CountMagicLinksSince(since time.Time, email, clientIP string) (int64, error) {
	query := DB.Model(&AuthFlow{}).Where("purpose = ? AND created_at >= ?", MagicLinkPurpose, since)
	if email != "" {
		query = query.Where("provider = ?", NormalizeEmail(email))
	}
	if clientIP != "" {
		query = query.Where("session_id = ?", MagicLinkIPPrefix+clientIP)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// ConsumeMagicLink marks a link as used and returns its state, with the
// address it was issued for normalized. A link is valid once, before its
// deadline, and only for its own purpose; an unknown, tampered, replayed,
// expired, or superseded token yields the same error family, so no response
// distinguishes them.
func ConsumeMagicLink(token string) (MagicLinkState, error) {
	flow, err := ConsumeAuthFlow(strings.TrimSpace(token), AuthFlowMatch{Purpose: MagicLinkPurpose})
	if err != nil {
		return MagicLinkState{}, err
	}
	var state MagicLinkState
	if err := common.UnmarshalJsonStr(flow.Payload, &state); err != nil {
		return MagicLinkState{}, ErrAuthFlowInvalid
	}
	state.Email = NormalizeEmail(state.Email)
	if state.Email == "" || len(state.Email) > MagicLinkEmailMaxLen {
		return MagicLinkState{}, ErrAuthFlowInvalid
	}
	return state, nil
}

// SafeMagicLinkRedirect keeps only an in-app continuation path: one leading
// slash, no host, no backslash or quote, and a bounded length. Anything else
// returns the empty string and the console uses its default landing page.
func SafeMagicLinkRedirect(redirect string) string {
	redirect = strings.TrimSpace(redirect)
	if redirect == "" ||
		len(redirect) > magicLinkRedirectMaxLen ||
		!strings.HasPrefix(redirect, "/") ||
		strings.HasPrefix(redirect, "//") ||
		strings.ContainsAny(redirect, "\\\"'") ||
		strings.ContainsRune(redirect, '\n') ||
		strings.ContainsRune(redirect, '\r') {
		return ""
	}
	return redirect
}
