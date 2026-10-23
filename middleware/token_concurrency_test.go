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

// tokenConcurrencyRouter serves /:token/:group; each request holds its slot
// until release is closed, after signalling on started.
func tokenConcurrencyRouter(release <-chan struct{}, started chan<- struct{}) *gin.Engine {
	router := gin.New()
	router.GET("/:token/:group", func(c *gin.Context) {
		tokenID, _ := strconv.Atoi(c.Param("token"))
		c.Set(string(constant.ContextKeyTokenId), tokenID)
		common.SetContextKey(c, constant.ContextKeyUserGroup, c.Param("group"))
	}, TokenConcurrencyLimit(), func(c *gin.Context) {
		started <- struct{}{}
		<-release
		c.Status(http.StatusOK)
	})
	return router
}

func TestTokenConcurrencyLimit(t *testing.T) {
	require.NoError(t, i18n.Init())
	setting := operation_setting.GetTokenSetting()
	previous := setting.ConcurrencyLimits
	setting.ConcurrencyLimits = map[string]int{"default": 2}
	t.Cleanup(func() { setting.ConcurrencyLimits = previous })

	release := make(chan struct{})
	started := make(chan struct{}, 8)
	router := tokenConcurrencyRouter(release, started)
	get := func(path string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		return recorder
	}

	// Two requests of token 1 in the limited group fill its slots.
	var inFlight sync.WaitGroup
	for range 2 {
		inFlight.Go(func() { assert.Equal(t, http.StatusOK, get("/1/default").Code) })
		<-started
	}

	rejected := get("/1/default")
	assert.Equal(t, http.StatusTooManyRequests, rejected.Code)
	assert.Equal(t, "1", rejected.Header().Get("Retry-After"))

	// Another token, and a group without a limit, are not affected.
	inFlight.Go(func() { assert.Equal(t, http.StatusOK, get("/2/default").Code) })
	<-started
	inFlight.Go(func() { assert.Equal(t, http.StatusOK, get("/3/vip").Code) })
	<-started

	// Finished requests free their slots.
	close(release)
	inFlight.Wait()
	tokenRequestsInFlight.Lock()
	assert.Empty(t, tokenRequestsInFlight.counts)
	tokenRequestsInFlight.Unlock()
	inFlight.Go(func() { assert.Equal(t, http.StatusOK, get("/1/default").Code) })
	<-started
	inFlight.Wait()
}

func TestValidateTokenConcurrencyLimits(t *testing.T) {
	assert.NoError(t, operation_setting.ValidateTokenConcurrencyLimits(`{"default":5,"vip":0}`))
	assert.NoError(t, operation_setting.ValidateTokenConcurrencyLimits(`{}`))
	for _, value := range []string{`[5]`, `{"default":-1}`, `{"default":1.5}`, `{" default":5}`, `not json`} {
		assert.Error(t, operation_setting.ValidateTokenConcurrencyLimits(value), value)
	}
}
