package oauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOIDCProvider_GetName(t *testing.T) {
	settings := system_setting.GetOIDCSettings()
	originalDisplayName := settings.DisplayName
	defer func() { settings.DisplayName = originalDisplayName }()

	p := &OIDCProvider{}

	settings.DisplayName = ""
	assert.Equal(t, "OIDC", p.GetName())

	settings.DisplayName = "  Acme SSO  "
	assert.Equal(t, "Acme SSO", p.GetName())
}

func TestOIDCProvider_GetUserInfoRequiresVerifiedEmail(t *testing.T) {
	settings := system_setting.GetOIDCSettings()
	original := *settings
	defer func() { *settings = original }()
	settings.DisplayName = "Google"

	cases := []struct {
		name     string
		claim    string
		accepted bool
	}{
		{name: "boolean true", claim: `,"email_verified":true`, accepted: true},
		{name: "string true", claim: `,"email_verified":"true"`, accepted: true},
		{name: "boolean false", claim: `,"email_verified":false`},
		{name: "string false", claim: `,"email_verified":"false"`},
		{name: "claim absent", claim: ``},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "Bearer access", r.Header.Get("Authorization"))
				_, _ = w.Write([]byte(`{"sub":"108","email":"owner@example.com","name":"Owner"` + tc.claim + `}`))
			}))
			defer server.Close()
			settings.UserInfoEndpoint = server.URL

			user, err := (&OIDCProvider{}).GetUserInfo(context.Background(), &OAuthToken{AccessToken: "access"})
			if tc.accepted {
				require.NoError(t, err)
				assert.Equal(t, "108", user.ProviderUserID)
				assert.Equal(t, "owner@example.com", user.Email)
				return
			}
			require.Nil(t, user)
			var oauthErr *OAuthError
			require.ErrorAs(t, err, &oauthErr)
			assert.Equal(t, msgEmailUnverified, oauthErr.Message.Key)
		})
	}
}
