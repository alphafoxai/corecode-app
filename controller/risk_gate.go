package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// riskGateRange reads ?start= and ?end= as Unix seconds, defaulting to the
// last 24 hours. The console sends the bounds of the viewer's own day.
func riskGateRange(c *gin.Context) (int64, int64) {
	end, err := strconv.ParseInt(c.Query("end"), 10, 64)
	if err != nil || end <= 0 {
		end = common.GetTimestamp() + 1
	}
	start, err := strconv.ParseInt(c.Query("start"), 10, 64)
	if err != nil || start <= 0 || start >= end {
		start = end - 86400
	}
	return start, end
}

// GetRiskGateSummary returns the gate's funnel for a time range: requests in,
// events by stage and action, the most frequent rules and decision model use.
func GetRiskGateSummary(c *gin.Context) {
	start, end := riskGateRange(c)
	summary, err := model.GetRiskGateSummary(start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}

// GetRiskGateEvents lists the gate's events in a time range, newest first,
// optionally for one stage (?stage=).
func GetRiskGateEvents(c *gin.Context) {
	start, end := riskGateRange(c)
	pageInfo := common.GetPageQuery(c)
	events, total, err := model.ListRiskGateEvents(pageInfo, start, end, c.Query("stage"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(events)
	common.ApiSuccess(c, pageInfo)
}
