package middleware

import (
	"net/http"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

// tokenRequestsInFlight counts each token's unfinished relay requests. It lives
// in process memory: one new-api instance serves the relay, and a crash cannot
// leave a stale count behind the way a shared counter would. With several
// instances each one enforces the limit on its own share of the traffic.
var tokenRequestsInFlight = struct {
	sync.Mutex
	counts map[int]int
}{counts: map[int]int{}}

// TokenConcurrencyLimit rejects a request with 429 while its token already has
// as many requests in flight as the owner's user group allows. A streamed
// response holds its slot until the stream ends.
func TokenConcurrencyLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenID := c.GetInt(string(constant.ContextKeyTokenId))
		limit := operation_setting.GetTokenConcurrencyLimit(
			common.GetContextKeyString(c, constant.ContextKeyUserGroup))
		if tokenID == 0 || limit == 0 {
			c.Next()
			return
		}

		tokenRequestsInFlight.Lock()
		if tokenRequestsInFlight.counts[tokenID] >= limit {
			tokenRequestsInFlight.Unlock()
			c.Header("Retry-After", "1")
			abortWithOpenAiMessage(c, http.StatusTooManyRequests,
				i18n.T(c, i18n.MsgTokenConcurrencyLimitReached, map[string]any{"Max": limit}))
			return
		}
		tokenRequestsInFlight.counts[tokenID]++
		tokenRequestsInFlight.Unlock()

		defer func() {
			tokenRequestsInFlight.Lock()
			defer tokenRequestsInFlight.Unlock()
			tokenRequestsInFlight.counts[tokenID]--
			if tokenRequestsInFlight.counts[tokenID] <= 0 {
				delete(tokenRequestsInFlight.counts, tokenID)
			}
		}()
		c.Next()
	}
}
