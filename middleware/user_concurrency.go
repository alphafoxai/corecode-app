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

// userRequestsInFlight counts each user's unfinished relay requests across all
// of the user's tokens. It lives in process memory: one new-api instance serves
// the relay, and a crash cannot leave a stale count behind the way a shared
// counter would. With several instances each one enforces the limit on its own
// share of the traffic.
var userRequestsInFlight = struct {
	sync.Mutex
	counts map[int]int
}{counts: map[int]int{}}

// UserConcurrencyLimit rejects a request with 429 while its user already has as
// many requests in flight, over all of the user's tokens, as the user's group
// allows. A streamed response holds its slot until the stream ends.
func UserConcurrencyLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetInt(string(constant.ContextKeyUserId))
		limit := operation_setting.GetUserConcurrencyLimit(
			common.GetContextKeyString(c, constant.ContextKeyUserGroup))
		if userID == 0 || limit == 0 {
			c.Next()
			return
		}

		userRequestsInFlight.Lock()
		if userRequestsInFlight.counts[userID] >= limit {
			userRequestsInFlight.Unlock()
			c.Header("Retry-After", "1")
			abortWithOpenAiMessage(c, http.StatusTooManyRequests,
				i18n.T(c, i18n.MsgUserConcurrencyLimitReached, map[string]any{"Max": limit}))
			return
		}
		userRequestsInFlight.counts[userID]++
		userRequestsInFlight.Unlock()

		defer func() {
			userRequestsInFlight.Lock()
			defer userRequestsInFlight.Unlock()
			userRequestsInFlight.counts[userID]--
			if userRequestsInFlight.counts[userID] <= 0 {
				delete(userRequestsInFlight.counts, userID)
			}
		}()
		c.Next()
	}
}
