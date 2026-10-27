package router

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Every anonymous route that checks a password, opens an account or spends a
// mail refuses a request without a Turnstile token once the switch is on, and
// the refusal comes before the handler reads the body or the database.
func TestTurnstileGuardsAnonymousAccountEntryPoints(t *testing.T) {
	engine := newAccessTokenScopeTestEngine(t)
	enabled, siteKey, secretKey := common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey
	common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey = true, "site", "secret"
	t.Cleanup(func() {
		common.TurnstileCheckEnabled, common.TurnstileSiteKey, common.TurnstileSecretKey = enabled, siteKey, secretKey
	})

	for _, route := range humanCheckedRoutes {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.path, strings.NewReader(`{"email":"a@example.com"}`))
			req.Header.Set("Content-Type", "application/json")
			// Each test uses its own address so the per-IP mail limiters do not
			// carry over between tests.
			req.RemoteAddr = "192.0.2.1:1234"
			rec := httptest.NewRecorder()
			engine.ServeHTTP(rec, req)

			var body struct {
				Success bool   `json:"success"`
				Message string `json:"message"`
			}
			require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &body), rec.Body.String())
			assert.False(t, body.Success)
			assert.Equal(t, "Turnstile token is empty", body.Message)
		})
	}
}

var humanCheckedRoutes = []struct{ method, path string }{
	{http.MethodPost, "/api/magic_link/send"},
	{http.MethodPost, "/api/user/register"},
	{http.MethodPost, "/api/user/login"},
	{http.MethodGet, "/api/verification?email=a@example.com"},
	{http.MethodGet, "/api/reset_password?email=a@example.com"},
}

// The same entry points refuse a request without a proof-of-work solution
// once that switch is on, with Turnstile off.
func TestPowGuardsAnonymousAccountEntryPoints(t *testing.T) {
	engine := newAccessTokenScopeTestEngine(t)
	enabled := common.PowCheckEnabled
	common.PowCheckEnabled = true
	t.Cleanup(func() { common.PowCheckEnabled = enabled })

	for _, route := range humanCheckedRoutes {
		t.Run(route.method+" "+route.path, func(t *testing.T) {
			req := httptest.NewRequest(route.method, route.path, strings.NewReader(`{"email":"a@example.com"}`))
			req.Header.Set("Content-Type", "application/json")
			req.RemoteAddr = "192.0.2.2:1234"
			rec := httptest.NewRecorder()
			engine.ServeHTTP(rec, req)

			var body struct {
				Success bool   `json:"success"`
				Message string `json:"message"`
			}
			require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &body), rec.Body.String())
			assert.False(t, body.Success)
			assert.Equal(t, "Browser check is missing, please refresh the page and try again", body.Message)
		})
	}
}

// The challenge endpoint is anonymous, uncached, and answers with a challenge
// whose secret number lies inside the advertised search space.
func TestPowChallengeEndpointIssuesASolvableChallenge(t *testing.T) {
	engine := newAccessTokenScopeTestEngine(t)
	maxNumber := common.PowMaxNumber
	common.PowMaxNumber = service.PowMinMaxNumber
	t.Cleanup(func() { common.PowMaxNumber = maxNumber })

	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/pow/challenge", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Header().Get("Cache-Control"), "no-store")

	var body struct {
		Success bool                 `json:"success"`
		Data    service.PowChallenge `json:"data"`
	}
	require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &body), rec.Body.String())
	require.True(t, body.Success)
	assert.Equal(t, service.PowMinMaxNumber, body.Data.MaxNumber)
	solved := false
	for number := 0; number <= body.Data.MaxNumber && !solved; number++ {
		sum := sha256.Sum256([]byte(body.Data.Salt + strconv.Itoa(number)))
		solved = hex.EncodeToString(sum[:]) == body.Data.Challenge
	}
	assert.True(t, solved)
}
