package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const verifiedEmailTestAddress = "google-customer@example.com"

func insertVerifiedEmailTestUser(t *testing.T, oidcID string) *model.User {
	t.Helper()
	user := &model.User{
		Username: "google-customer", Email: verifiedEmailTestAddress,
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1,
	}
	require.NoError(t, user.Insert(0))
	if oidcID != "" {
		require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("oidc_id", oidcID).Error)
	}
	return user
}

func findOrCreateGoogleUser(t *testing.T, subject string, verified bool) (*model.User, error) {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/oauth/oidc", nil)
	user, _, err := findOrCreateOAuthUser(c, &oauth.OIDCProvider{}, &oauth.OAuthUser{
		ProviderUserID: subject, DisplayName: "Google Customer",
		Email: verifiedEmailTestAddress, EmailVerified: verified,
	}, &oauth.OAuthToken{}, "")
	return user, err
}

func storedOidcID(t *testing.T, userID int) string {
	t.Helper()
	var user model.User
	require.NoError(t, model.DB.Select("oidc_id").Where("id = ?", userID).Take(&user).Error)
	return user.OidcId
}

func TestOAuthVerifiedEmailLinksTheAccountHoldingIt(t *testing.T) {
	setupMagicLinkTest(t)
	existing := insertVerifiedEmailTestUser(t, "")

	user, err := findOrCreateGoogleUser(t, "google-sub-1", true)
	require.NoError(t, err)
	assert.Equal(t, existing.Id, user.Id)
	assert.Equal(t, "google-sub-1", storedOidcID(t, existing.Id))

	again, err := findOrCreateGoogleUser(t, "google-sub-1", true)
	require.NoError(t, err)
	assert.Equal(t, existing.Id, again.Id, "the second sign-in finds the binding, not the email")
}

func TestOAuthUnverifiedEmailNeverLinks(t *testing.T) {
	setupMagicLinkTest(t)
	existing := insertVerifiedEmailTestUser(t, "")

	_, err := findOrCreateGoogleUser(t, "google-sub-1", false)
	require.ErrorAs(t, err, new(*OAuthEmailAlreadyTakenError))
	assert.Empty(t, storedOidcID(t, existing.Id))
}

func TestOAuthVerifiedEmailNeverReplacesABinding(t *testing.T) {
	setupMagicLinkTest(t)
	existing := insertVerifiedEmailTestUser(t, "google-sub-original")

	_, err := findOrCreateGoogleUser(t, "google-sub-other", true)
	require.ErrorAs(t, err, new(*OAuthEmailAlreadyTakenError))
	assert.Equal(t, "google-sub-original", storedOidcID(t, existing.Id))
}

func TestOAuthVerifiedEmailLeavesSecondFactorAccountsToSettings(t *testing.T) {
	setupMagicLinkTest(t)
	existing := insertVerifiedEmailTestUser(t, "")
	require.NoError(t, model.DB.Create(&model.TwoFA{UserId: existing.Id, Secret: "JBSWY3DPEHPK3PXP", IsEnabled: true}).Error)

	_, err := findOrCreateGoogleUser(t, "google-sub-1", true)
	require.ErrorAs(t, err, new(*OAuthLegacyBindingNotConfirmedError))
	assert.Empty(t, storedOidcID(t, existing.Id))
}

func TestOAuthVerifiedEmailReturnsDisabledAccountsUnlinked(t *testing.T) {
	setupMagicLinkTest(t)
	existing := insertVerifiedEmailTestUser(t, "")
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", existing.Id).Update("status", common.UserStatusDisabled).Error)

	user, err := findOrCreateGoogleUser(t, "google-sub-1", true)
	require.NoError(t, err)
	assert.Equal(t, common.UserStatusDisabled, user.Status)
	assert.Empty(t, storedOidcID(t, existing.Id))
}

func TestOAuthVerifiedEmailRegistersAnUnknownAddress(t *testing.T) {
	setupMagicLinkTest(t)

	user, err := findOrCreateGoogleUser(t, "google-sub-new", true)
	require.NoError(t, err)
	assert.Equal(t, verifiedEmailTestAddress, user.Email)
	assert.Equal(t, "google-sub-new", storedOidcID(t, user.Id))
}
