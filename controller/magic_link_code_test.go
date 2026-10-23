package controller

import (
	"net/http"
	"regexp"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var magicLinkCodePattern = regexp.MustCompile(`monospace">(\d{6})</p>`)

// sendMagicLinkMail requests a link and returns the delivered token and code.
func sendMagicLinkMail(t *testing.T, messages chan string) (string, string) {
	t.Helper()
	require.Equal(t, http.StatusOK, magicLinkPost(t, "/api/magic_link/send", `{"email":"`+magicLinkTestEmail+`"}`, SendMagicLink).Code)
	var raw string
	select {
	case raw = <-messages:
	case <-time.After(5 * time.Second):
		t.Fatal("no sign-in email was delivered")
	}
	match := magicLinkCodePattern.FindStringSubmatch(raw)
	require.Len(t, match, 2, "sign-in code missing from email: %s", raw)
	return extractMagicLinkToken(t, raw), match[1]
}

func postMagicLinkCode(t *testing.T, email, code string) map[string]any {
	t.Helper()
	return decodeMagicLinkResponse(t, magicLinkPost(t, "/api/magic_link/code", `{"email":"`+email+`","code":"`+code+`"}`, LoginWithMagicLinkCode))
}

func wrongMagicLinkCode(code string) string {
	if code == "000000" {
		return "000001"
	}
	return "000000"
}

func TestMagicLinkCodeSignsInAndSpendsTheLink(t *testing.T) {
	messages := setupMagicLinkTest(t)
	token, code := sendMagicLinkMail(t, messages)

	payload := postMagicLinkCode(t, magicLinkTestEmail, code)
	require.Equal(t, true, payload["success"], payload["message"])
	data, ok := payload["data"].(map[string]any)
	require.True(t, ok)
	assert.True(t, serviceIsAuthBundle(data), "expected a session bundle, got %v", data)
	_, err := model.GetUniqueUserByEmail(magicLinkTestEmail)
	require.NoError(t, err, "a code registers an unknown address like the link does")

	link := decodeMagicLinkResponse(t, magicLinkPost(t, "/api/magic_link/login", `{"token":"`+token+`"}`, LoginWithMagicLink))
	assert.Equal(t, false, link["success"], "the code and the link are one credential")
	assert.Equal(t, false, postMagicLinkCode(t, magicLinkTestEmail, code)["success"], "a code works once")
}

func TestMagicLinkSpendsTheCode(t *testing.T) {
	messages := setupMagicLinkTest(t)
	token, code := sendMagicLinkMail(t, messages)

	require.Equal(t, true, decodeMagicLinkResponse(t, magicLinkPost(t, "/api/magic_link/login", `{"token":"`+token+`"}`, LoginWithMagicLink))["success"])
	payload := postMagicLinkCode(t, magicLinkTestEmail, code)
	assert.Equal(t, false, payload["success"])
	assert.Equal(t, "Code is incorrect or has expired", payload["message"])
}

func TestMagicLinkCodeIsBoundToItsAddress(t *testing.T) {
	messages := setupMagicLinkTest(t)
	_, code := sendMagicLinkMail(t, messages)

	assert.Equal(t, false, postMagicLinkCode(t, "someone-else@example.com", code)["success"])
	assert.Equal(t, true, postMagicLinkCode(t, magicLinkTestEmail, code)["success"])
}

func TestMagicLinkCodeSurvivesFewerMissesThanTheCap(t *testing.T) {
	messages := setupMagicLinkTest(t)
	_, code := sendMagicLinkMail(t, messages)

	for range model.MagicLinkCodeMaxAttempts - 1 {
		assert.Equal(t, false, postMagicLinkCode(t, magicLinkTestEmail, wrongMagicLinkCode(code))["success"])
	}
	assert.Equal(t, true, postMagicLinkCode(t, magicLinkTestEmail, code)["success"])
}

func TestMagicLinkCodeMissesBurnTheLink(t *testing.T) {
	messages := setupMagicLinkTest(t)
	token, code := sendMagicLinkMail(t, messages)

	for range model.MagicLinkCodeMaxAttempts {
		payload := postMagicLinkCode(t, magicLinkTestEmail, wrongMagicLinkCode(code))
		assert.Equal(t, "Code is incorrect or has expired", payload["message"])
	}
	assert.Equal(t, false, postMagicLinkCode(t, magicLinkTestEmail, code)["success"], "the right code after the cap")
	link := decodeMagicLinkResponse(t, magicLinkPost(t, "/api/magic_link/login", `{"token":"`+token+`"}`, LoginWithMagicLink))
	assert.Equal(t, false, link["success"], "burning the code burns the link with it")
}

func TestMagicLinkCodeFromASupersededMailFails(t *testing.T) {
	messages := setupMagicLinkTest(t)
	_, first := sendMagicLinkMail(t, messages)
	require.NoError(t, model.DB.Model(&model.AuthFlow{}).
		Where("purpose = ?", model.MagicLinkPurpose).
		Update("created_at", time.Now().Add(-2*time.Minute)).Error)
	_, second := sendMagicLinkMail(t, messages)

	if first != second {
		assert.Equal(t, false, postMagicLinkCode(t, magicLinkTestEmail, first)["success"])
	}
	assert.Equal(t, true, postMagicLinkCode(t, magicLinkTestEmail, second)["success"])
}

func TestMagicLinkCodeExpiresWithTheLink(t *testing.T) {
	messages := setupMagicLinkTest(t)
	_, code := sendMagicLinkMail(t, messages)
	require.NoError(t, model.DB.Model(&model.AuthFlow{}).
		Where("purpose = ?", model.MagicLinkPurpose).
		Update("expires_at", time.Now().Add(-time.Second)).Error)

	assert.Equal(t, false, postMagicLinkCode(t, magicLinkTestEmail, code)["success"])
}
