package service

import (
	"crypto/rand"
	"errors"
	"fmt"
	"html"
	"math/big"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
)

var ErrEmailVerificationDelivery = errors.New("The verification email could not be sent. Try again later.")

// EmailVerificationCodeData tells the console where the code went and when it
// may ask for another; the address is masked.
type EmailVerificationCodeData struct {
	Email     string `json:"email"`
	ExpiresAt int64  `json:"expires_at"`
	ResendAt  int64  `json:"resend_at"`
}

// SendEmailVerificationCode mails a one-time code for one operation to the
// account's own address. It is the step-up for an account without a password,
// so the policy decides whether email is offered, never the caller.
func SendEmailVerificationCode(identity AuthIdentity, operation VerificationOperation, lang string) (*EmailVerificationCodeData, error) {
	binding, err := BindVerificationOperation(operation)
	if err != nil {
		return nil, err
	}
	if _, err := RequireVerificationMethod(identity, binding.Scope, VerificationMethodEmail); err != nil {
		return nil, err
	}
	user, err := model.GetUserById(identity.UserID, false)
	if err != nil {
		return nil, err
	}
	number, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return nil, err
	}
	code := fmt.Sprintf("%06d", number.Int64())
	flow, err := model.CreateEmailStepUp(identity, binding.Scope, binding.ContextHash, user.Email, code)
	if err != nil {
		return nil, err
	}
	subject := i18n.Translate(lang, i18n.MsgEmailStepUpSubject, map[string]any{"SystemName": common.SystemName})
	content := fmt.Sprintf("<p>%s</p><p>%s</p><p>%s</p>",
		i18n.Translate(lang, i18n.MsgEmailStepUpIntro),
		i18n.Translate(lang, i18n.MsgEmailBindingCode, map[string]any{"Code": html.EscapeString(code)}),
		i18n.Translate(lang, i18n.MsgEmailStepUpValidity, map[string]any{"Minutes": int(model.EmailStepUpTTL / time.Minute)}))
	if err := common.SendEmail(subject, model.NormalizeEmail(user.Email), content); err != nil {
		_ = model.CancelEmailStepUp(flow.Id)
		return nil, ErrEmailVerificationDelivery
	}
	return &EmailVerificationCodeData{
		Email:     common.MaskEmail(model.NormalizeEmail(user.Email)),
		ExpiresAt: flow.ExpiresAt.Unix(),
		ResendAt:  flow.CreatedAt.Add(model.EmailStepUpResendDelay).Unix(),
	}, nil
}
