package middleware

import (
	"maps"
	"net/http"
	"sync"
	"time"

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
	// rejected counts 429s by the unix second their hour starts, kept for
	// userConcurrencyRejectionHours, so the root dashboard can show requests
	// turned away here, which never reach the request logs.
	rejected map[int64]int
}{counts: map[int]int{}, rejected: map[int64]int{}}

const userConcurrencyRejectionHours = 48

// UserConcurrencySnapshot returns every user's requests in flight on this
// instance and its 429s by hour over the last two days.
func UserConcurrencySnapshot() (inFlight map[int]int, rejectedByHour map[int64]int) {
	userRequestsInFlight.Lock()
	defer userRequestsInFlight.Unlock()
	return maps.Clone(userRequestsInFlight.counts), maps.Clone(userRequestsInFlight.rejected)
}

// recordUserConcurrencyRejection must be called with userRequestsInFlight held.
func recordUserConcurrencyRejection(now time.Time) {
	hour := now.Truncate(time.Hour).Unix()
	userRequestsInFlight.rejected[hour]++
	for at := range userRequestsInFlight.rejected {
		if at <= hour-userConcurrencyRejectionHours*3600 {
			delete(userRequestsInFlight.rejected, at)
		}
	}
}

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
			recordUserConcurrencyRejection(time.Now())
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
