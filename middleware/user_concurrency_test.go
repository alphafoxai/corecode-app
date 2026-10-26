package middleware

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// userConcurrencyRouter serves /:user/:token/:group; each request holds its
// slot until release is closed, after signalling on started.
func userConcurrencyRouter(release <-chan struct{}, started chan<- struct{}) *gin.Engine {
	router := gin.New()
	router.GET("/:user/:token/:group", func(c *gin.Context) {
		userID, _ := strconv.Atoi(c.Param("user"))
		tokenID, _ := strconv.Atoi(c.Param("token"))
		c.Set(string(constant.ContextKeyUserId), userID)
		c.Set(string(constant.ContextKeyTokenId), tokenID)
		common.SetContextKey(c, constant.ContextKeyUserGroup, c.Param("group"))
	}, UserConcurrencyLimit(), func(c *gin.Context) {
		started <- struct{}{}
		<-release
		c.Status(http.StatusOK)
	})
	return router
}

func TestUserConcurrencyLimit(t *testing.T) {
	require.NoError(t, i18n.Init())
	setting := operation_setting.GetTokenSetting()
	previous := setting.ConcurrencyLimits
	setting.ConcurrencyLimits = map[string]int{"default": 2}
	t.Cleanup(func() { setting.ConcurrencyLimits = previous })

	release := make(chan struct{})
	started := make(chan struct{}, 8)
	router := userConcurrencyRouter(release, started)
	get := func(path string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		return recorder
	}

	// Requests on two of user 1's tokens fill the user's two slots, so a third
	// token of the same user is rejected.
	var inFlight sync.WaitGroup
	for _, path := range []string{"/1/10/default", "/1/11/default"} {
		inFlight.Go(func() { assert.Equal(t, http.StatusOK, get(path).Code) })
		<-started
	}

	rejected := get("/1/12/default")
	assert.Equal(t, http.StatusTooManyRequests, rejected.Code)
	assert.Equal(t, "1", rejected.Header().Get("Retry-After"))

	inFlightNow, rejectedByHour := UserConcurrencySnapshot()
	assert.Equal(t, 2, inFlightNow[1])
	total := 0
	for _, count := range rejectedByHour {
		total += count
	}
	assert.Positive(t, total)

	// Another user, and a group without a limit, are not affected.
	inFlight.Go(func() { assert.Equal(t, http.StatusOK, get("/2/20/default").Code) })
	<-started
	inFlight.Go(func() { assert.Equal(t, http.StatusOK, get("/3/30/vip").Code) })
	<-started

	// Finished requests free their slots.
	close(release)
	inFlight.Wait()
	userRequestsInFlight.Lock()
	assert.Empty(t, userRequestsInFlight.counts)
	userRequestsInFlight.Unlock()
	inFlight.Go(func() { assert.Equal(t, http.StatusOK, get("/1/10/default").Code) })
	<-started
	inFlight.Wait()
}

func TestValidateConcurrencyLimits(t *testing.T) {
	assert.NoError(t, operation_setting.ValidateConcurrencyLimits(`{"default":5,"vip":0}`))
	assert.NoError(t, operation_setting.ValidateConcurrencyLimits(`{}`))
	for _, value := range []string{`[5]`, `{"default":-1}`, `{"default":1.5}`, `{" default":5}`, `not json`} {
		assert.Error(t, operation_setting.ValidateConcurrencyLimits(value), value)
	}
}
