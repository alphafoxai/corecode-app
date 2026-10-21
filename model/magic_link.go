package model

import (
	"errors"
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
)

var ErrMagicLinkRegistrationDisabled = errors.New("magic link registration is disabled")

// MagicLinkState is server-owned payload. It carries the address the link was
// issued for, so consumption needs nothing but the opaque token and the link URL
// leaks no account identifier.
type MagicLinkState struct {
	Email string `json:"email"`
	IP    string `json:"ip,omitempty"`
}

// CreateMagicLink issues a single-use sign-in link for an email address and
// returns the opaque token together with the instant it stops working.
//
// Issuing consumes every earlier link for the same mailbox. One mailbox
// therefore holds at most one live link: an older message in the inbox cannot
// sign in after a newer request, and two live links can never race into two
// accounts. Superseded rows stay counted, so the send throttle measures every
// link actually issued rather than only the survivors.
func CreateMagicLink(email, clientIP string) (string, time.Time, error) {
	email = NormalizeEmail(email)
	if email == "" || len(email) > MagicLinkEmailMaxLen {
		return "", time.Time{}, ErrAuthFlowInvalid
	}
	payload, err := common.Marshal(MagicLinkState{Email: email, IP: clientIP})
	if err != nil {
		return "", time.Time{}, err
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
		return "", time.Time{}, err
	}
	return token, flow.ExpiresAt, nil
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

// ConsumeMagicLink marks a link as used and returns the address it was issued
// for. A link is valid once, before its deadline, and only for its own purpose;
// an unknown, tampered, replayed, expired, or superseded token yields the same
// error family, so no response distinguishes them.
func ConsumeMagicLink(token string) (string, error) {
	flow, err := ConsumeAuthFlow(strings.TrimSpace(token), AuthFlowMatch{Purpose: MagicLinkPurpose})
	if err != nil {
		return "", err
	}
	var state MagicLinkState
	if err := common.UnmarshalJsonStr(flow.Payload, &state); err != nil {
		return "", ErrAuthFlowInvalid
	}
	email := NormalizeEmail(state.Email)
	if email == "" || len(email) > MagicLinkEmailMaxLen {
		return "", ErrAuthFlowInvalid
	}
	return email, nil
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
