package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// GetViolationRecords lists upstream usage-policy refusals and what the
// violation guard decided, newest first, optionally for one user (?user_id=).
func GetViolationRecords(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userId, _ := strconv.Atoi(c.Query("user_id"))
	records, total, err := model.ListViolationRecords(pageInfo, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(records)
	common.ApiSuccess(c, pageInfo)
}

// LiftUserViolations ends the user's violation suspension, unblocks the
// conversations the upstream refused, and stops earlier strikes from counting.
// An account the guard disabled is re-enabled through user management.
func LiftUserViolations(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !canManageTargetRole(c.GetInt("role"), user.Role) {
		common.ApiErrorT(c, "No permission to update users of same or higher permission level")
		return
	}
	if err := service.ForgiveViolations(user.Id); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, user.Id, "user.manage", map[string]any{
		"action":   "lift_violations",
		"username": user.Username,
		"id":       user.Id,
	})
	common.ApiSuccess(c, nil)
}
