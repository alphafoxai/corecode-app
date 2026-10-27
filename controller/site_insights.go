package controller

import (
	"cmp"
	"slices"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

// The root dashboard's views. Each reads start_time and end_time (unix
// seconds, end exclusive) and tz_offset (minutes east of UTC), and rejects a
// span longer than its own bound.

func insightsRange(c *gin.Context, maxDays int64) (model.InsightsRange, bool) {
	start, _ := strconv.ParseInt(c.Query("start_time"), 10, 64)
	end, _ := strconv.ParseInt(c.Query("end_time"), 10, 64)
	offset, err := strconv.ParseInt(c.DefaultQuery("tz_offset", "0"), 10, 64)
	if err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return model.InsightsRange{}, false
	}
	r, ok := model.ResolveInsightsRange(start, end, offset*60, maxDays)
	if !ok {
		common.ApiErrorT(c, "Invalid parameters")
	}
	return r, ok
}

func serveInsights[T any](c *gin.Context, maxDays int64, read func(model.InsightsRange) (T, error)) {
	r, ok := insightsRange(c, maxDays)
	if !ok {
		return
	}
	result, err := read(r)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

// LiveUserConcurrency is one user's requests in flight on this instance.
// LimitSource is "user" for a per-user override, "tier" for a paid-total
// tier and "group" otherwise.
type LiveUserConcurrency struct {
	model.UserRef
	InFlight    int    `json:"in_flight"`
	Limit       int    `json:"limit"`
	LimitSource string `json:"limit_source"`
}

// UserConcurrencyOverride is one per-user limit, with the group limit it
// replaces.
type UserConcurrencyOverride struct {
	model.UserRef
	Group      string `json:"group"`
	Limit      int    `json:"limit"`
	GroupLimit int    `json:"group_limit"`
	InFlight   int    `json:"in_flight"`
}

// CapacityResponse adds the requests in flight on this process, the per-user
// limit's rejections and the engine pool to the logs view. Root is left out
// of all of them.
type CapacityResponse struct {
	*model.CapacityInsights
	InFlight            int                                 `json:"in_flight"`
	InFlightUsers       []LiveUserConcurrency               `json:"in_flight_users"`
	LimitRejections     []model.CountPoint                  `json:"limit_rejections"`
	LimitRejectionTotal int64                               `json:"limit_rejection_total"`
	LimitRejectedUsers  []model.UserCount                   `json:"limit_rejected_users"`
	ConcurrencyLimits   map[string]int                      `json:"concurrency_limits"`
	ConcurrencyTiers    []operation_setting.ConcurrencyTier `json:"concurrency_tiers"`
	UserLimits          []UserConcurrencyOverride           `json:"user_limits"`
	Pool                service.EnginePool                  `json:"pool"`
}

func GetCapacityInsights(c *gin.Context) {
	serveInsights(c, model.InsightsMaxLogDays, func(r model.InsightsRange) (*CapacityResponse, error) {
		insights, err := model.GetCapacityInsights(r)
		if err != nil {
			return nil, err
		}
		response := &CapacityResponse{
			CapacityInsights:  insights,
			InFlightUsers:     []LiveUserConcurrency{},
			ConcurrencyLimits: operation_setting.GetTokenSetting().ConcurrencyLimits,
			ConcurrencyTiers:  operation_setting.GetTokenSetting().ConcurrencyTiers,
		}
		inFlight := middleware.UserConcurrencySnapshot()
		overrides := operation_setting.GetTokenSetting().UserConcurrencyLimits
		ids := make([]int, 0, len(inFlight)+len(overrides))
		for id := range inFlight {
			ids = append(ids, id)
		}
		for key := range overrides {
			if id, err := strconv.Atoi(key); err == nil {
				ids = append(ids, id)
			}
		}
		users, err := model.InsightsUsers(ids)
		if err != nil {
			return nil, err
		}
		for id, count := range inFlight {
			user := users[id]
			if user.Role >= common.RoleRootUser {
				continue
			}
			response.InFlight += count
			limit, source := operation_setting.EffectiveUserConcurrencyLimit(id, user.Group,
				func() float64 { return model.CachedUserPaidMoney(id) })
			response.InFlightUsers = append(response.InFlightUsers, LiveUserConcurrency{
				UserRef:     model.UserRef{UserID: id, Username: user.Username},
				InFlight:    count,
				Limit:       limit,
				LimitSource: source,
			})
		}
		response.UserLimits = []UserConcurrencyOverride{}
		for key, limit := range overrides {
			id, err := strconv.Atoi(key)
			if err != nil {
				continue
			}
			user := users[id]
			response.UserLimits = append(response.UserLimits, UserConcurrencyOverride{
				UserRef:    model.UserRef{UserID: id, Username: user.Username},
				Group:      user.Group,
				Limit:      limit,
				GroupLimit: operation_setting.GetUserConcurrencyLimit(user.Group),
				InFlight:   inFlight[id],
			})
		}
		slices.SortFunc(response.UserLimits, func(a, b UserConcurrencyOverride) int { return cmp.Compare(a.UserID, b.UserID) })
		slices.SortFunc(response.InFlightUsers, func(a, b LiveUserConcurrency) int {
			return cmp.Or(cmp.Compare(b.InFlight, a.InFlight), cmp.Compare(a.UserID, b.UserID))
		})
		response.LimitRejections, response.LimitRejectedUsers, err = model.ReadUserConcurrencyRejections(r.Start, r.End)
		if err != nil {
			return nil, err
		}
		for _, point := range response.LimitRejections {
			response.LimitRejectionTotal += point.Count
		}
		response.Pool = service.FetchEnginePool(c.Request.Context())
		return response, nil
	})
}

func GetFinanceInsights(c *gin.Context) {
	serveInsights(c, model.InsightsMaxDays, model.GetFinanceInsights)
}

func GetRiskInsights(c *gin.Context) {
	serveInsights(c, model.InsightsMaxRiskDays, model.GetRiskInsights)
}

func GetGrowthInsights(c *gin.Context) {
	serveInsights(c, model.InsightsMaxDays, model.GetGrowthInsights)
}

func GetActivityInsights(c *gin.Context) {
	serveInsights(c, model.InsightsMaxDays, model.GetActivityInsights)
}

func GetQualityInsights(c *gin.Context) {
	serveInsights(c, model.InsightsMaxLogDays, model.GetQualityInsights)
}

func GetBusinessInsights(c *gin.Context) {
	serveInsights(c, model.InsightsMaxLogDays, model.GetBusinessInsights)
}
