package middleware

import (
	"maps"
	"net/http"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
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
	// rejected holds 429s not yet written to the database. Those requests
	// never reach the request logs, so the root dashboard reads them from
	// model.UserConcurrencyRejection.
	rejected map[model.ConcurrencyRejectionKey]int64
}{counts: map[int]int{}, rejected: map[model.ConcurrencyRejectionKey]int64{}}

const userConcurrencyRejectionFlushInterval = 30 * time.Second

// UserConcurrencySnapshot returns every user's requests in flight on this
// instance.
func UserConcurrencySnapshot() map[int]int {
	userRequestsInFlight.Lock()
	defer userRequestsInFlight.Unlock()
	return maps.Clone(userRequestsInFlight.counts)
}

// recordUserConcurrencyRejection must be called with userRequestsInFlight held.
func recordUserConcurrencyRejection(userID int, now time.Time) {
	userRequestsInFlight.rejected[model.ConcurrencyRejectionKey{
		HourStart: now.Truncate(time.Hour).Unix(),
		UserId:    userID,
	}]++
}

// StartUserConcurrencyRejectionFlush writes the buffered 429s every 30
// seconds. Shutdown calls FlushUserConcurrencyRejections for the rest.
func StartUserConcurrencyRejectionFlush() {
	gopool.Go(func() {
		ticker := time.NewTicker(userConcurrencyRejectionFlushInterval)
		defer ticker.Stop()
		for range ticker.C {
			FlushUserConcurrencyRejections()
		}
	})
}

var userConcurrencyRejectionWriting sync.Mutex

// FlushUserConcurrencyRejections writes the buffered 429s. Counts that fail to
// write go back into the buffer for the next flush.
func FlushUserConcurrencyRejections() {
	userConcurrencyRejectionWriting.Lock()
	defer userConcurrencyRejectionWriting.Unlock()
	userRequestsInFlight.Lock()
	pending := userRequestsInFlight.rejected
	userRequestsInFlight.rejected = map[model.ConcurrencyRejectionKey]int64{}
	userRequestsInFlight.Unlock()
	if len(pending) == 0 {
		return
	}
	failed := model.AddUserConcurrencyRejections(pending)
	if len(failed) == 0 {
		return
	}
	userRequestsInFlight.Lock()
	for key, count := range failed {
		userRequestsInFlight.rejected[key] += count
	}
	userRequestsInFlight.Unlock()
}

// UserConcurrencyLimit rejects a request with 429 while its user already has as
// many requests in flight, over all of the user's tokens, as the user's group
// allows. A streamed response holds its slot until the stream ends.
func UserConcurrencyLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetInt(string(constant.ContextKeyUserId))
		limit, _ := operation_setting.EffectiveUserConcurrencyLimit(userID,
			common.GetContextKeyString(c, constant.ContextKeyUserGroup))
		if userID == 0 || limit == 0 {
			c.Next()
			return
		}

		userRequestsInFlight.Lock()
		if userRequestsInFlight.counts[userID] >= limit {
			recordUserConcurrencyRejection(userID, time.Now())
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
