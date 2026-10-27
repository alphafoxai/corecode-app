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

	assert.Equal(t, 2, UserConcurrencySnapshot()[1])
	userRequestsInFlight.Lock()
	var buffered int64
	for key, count := range userRequestsInFlight.rejected {
		if key.UserId == 1 {
			buffered += count
		}
	}
	userRequestsInFlight.Unlock()
	assert.Positive(t, buffered, "the 429 waits in the buffer for the database")

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

func TestUserConcurrencyOverride(t *testing.T) {
	require.NoError(t, i18n.Init())
	setting := operation_setting.GetTokenSetting()
	previousGroups, previousUsers := setting.ConcurrencyLimits, setting.UserConcurrencyLimits
	// User 7 may run three at once despite the group's one; user 8 is unlimited.
	setting.ConcurrencyLimits = map[string]int{"default": 1}
	setting.UserConcurrencyLimits = map[string]int{"7": 3, "8": 0}
	t.Cleanup(func() { setting.ConcurrencyLimits, setting.UserConcurrencyLimits = previousGroups, previousUsers })

	release := make(chan struct{})
	started := make(chan struct{}, 16)
	router := userConcurrencyRouter(release, started)
	get := func(path string) int {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		return recorder.Code
	}
	var inFlight sync.WaitGroup
	for _, path := range []string{"/7/1/default", "/7/2/default", "/7/3/default", "/8/1/default", "/8/2/default", "/9/1/default"} {
		inFlight.Go(func() { assert.Equal(t, http.StatusOK, get(path)) })
		<-started
	}
	assert.Equal(t, http.StatusTooManyRequests, get("/7/4/default"), "the override is the cap")
	assert.Equal(t, http.StatusTooManyRequests, get("/9/2/default"), "users without an override keep the group limit")
	close(release)
	inFlight.Wait()
}

func TestEffectiveUserConcurrencyLimit(t *testing.T) {
	setting := operation_setting.GetTokenSetting()
	previousGroups, previousUsers := setting.ConcurrencyLimits, setting.UserConcurrencyLimits
	setting.ConcurrencyLimits = map[string]int{"default": 5}
	setting.UserConcurrencyLimits = map[string]int{"7": 20, "8": 0}
	t.Cleanup(func() { setting.ConcurrencyLimits, setting.UserConcurrencyLimits = previousGroups, previousUsers })

	limit, source := operation_setting.EffectiveUserConcurrencyLimit(7, "default")
	assert.Equal(t, 20, limit)
	assert.Equal(t, operation_setting.ConcurrencySourceUser, source)
	limit, source = operation_setting.EffectiveUserConcurrencyLimit(8, "default")
	assert.Equal(t, 0, limit, "0 lifts the limit")
	assert.Equal(t, operation_setting.ConcurrencySourceUser, source)
	limit, source = operation_setting.EffectiveUserConcurrencyLimit(9, "default")
	assert.Equal(t, 5, limit)
	assert.Equal(t, operation_setting.ConcurrencySourceGroup, source)
}

func TestValidateUserConcurrencyLimits(t *testing.T) {
	assert.NoError(t, operation_setting.ValidateUserConcurrencyLimits(`{"7":20,"8":0}`))
	assert.NoError(t, operation_setting.ValidateUserConcurrencyLimits(`{}`))
	for _, value := range []string{`{"abc":1}`, `{"0":1}`, `{"07":1}`, `{"7":-1}`, `{"7":1.5}`, `[1]`} {
		assert.Error(t, operation_setting.ValidateUserConcurrencyLimits(value), value)
	}
}

func TestValidateConcurrencyLimits(t *testing.T) {
	assert.NoError(t, operation_setting.ValidateConcurrencyLimits(`{"default":5,"vip":0}`))
	assert.NoError(t, operation_setting.ValidateConcurrencyLimits(`{}`))
	for _, value := range []string{`[5]`, `{"default":-1}`, `{"default":1.5}`, `{" default":5}`, `not json`} {
		assert.Error(t, operation_setting.ValidateConcurrencyLimits(value), value)
	}
}
