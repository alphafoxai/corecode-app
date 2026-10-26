package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func topUpReportFilter(c *gin.Context) model.TopUpFilter {
	start, _ := strconv.ParseInt(c.Query("start_time"), 10, 64)
	end, _ := strconv.ParseInt(c.Query("end_time"), 10, 64)
	return model.TopUpFilter{
		StartTime:     start,
		EndTime:       end,
		User:          c.Query("user"),
		TradeNo:       c.Query("trade_no"),
		Status:        c.Query("status"),
		PaymentMethod: c.Query("payment_method"),
	}
}

// GetTopUpRecords pages every user's top-ups for the administrator's
// top-up report, filtered by time, user, order number, status and method.
func GetTopUpRecords(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	records, total, err := model.ListTopUpRecords(topUpReportFilter(c), pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(records)
	common.ApiSuccess(c, pageInfo)
}

// GetTopUpStats summarizes successful top-ups for the report. tz_offset is
// the caller's offset from UTC in minutes east, so days split at its
// midnight.
func GetTopUpStats(c *gin.Context) {
	filter := topUpReportFilter(c)
	start, end, ok := model.TopUpReportRange(filter.StartTime, filter.EndTime)
	offset, err := strconv.ParseInt(c.DefaultQuery("tz_offset", "0"), 10, 64)
	if !ok || err != nil || offset < -14*60 || offset > 14*60 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	filter.StartTime, filter.EndTime = start, end
	stats, err := model.GetTopUpStats(filter, offset*60)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stats)
}
