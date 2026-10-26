package controller

import (
	"errors"
	"io"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

// affiliateSummary is what the wallet shows about the invitation program:
// the program terms and the user's rate, code and commission. While the
// program is on, every user has the default rate unless an administrator
// changed it.
type affiliateSummary struct {
	Enabled         bool             `json:"enabled"`
	SelfServeRate   int              `json:"self_serve_rate"`
	SecondLevelRate int              `json:"second_level_rate"`
	MinWithdrawal   int              `json:"min_withdrawal"`
	Affiliate       *model.Affiliate `json:"affiliate"`
	AffCode         string           `json:"aff_code"`
	InviteeCount    int64            `json:"invitee_count"`
	BalanceMoney    float64          `json:"balance_money"`
	EarnedMoney     float64          `json:"earned_money"`
}

func buildAffiliateSummary(userId int) (*affiliateSummary, error) {
	setting := operation_setting.GetAffiliateSetting()
	summary := &affiliateSummary{
		Enabled:         setting.Enabled,
		SelfServeRate:   setting.SelfServeRate,
		SecondLevelRate: setting.SecondLevelRate,
		MinWithdrawal:   setting.MinWithdrawal,
	}
	if err := model.EnsureDefaultAffiliate(userId); err != nil {
		return nil, err
	}
	affiliate, err := model.GetAffiliate(userId)
	if err != nil {
		return nil, err
	}
	if affiliate == nil {
		return summary, nil
	}
	summary.Affiliate = affiliate
	summary.BalanceMoney = model.AffiliateMoneyFromQuota(affiliate.Balance)
	summary.EarnedMoney = model.AffiliateMoneyFromQuota(affiliate.Earned)
	if affiliate.Rate > 0 {
		user, err := model.GetUserById(userId, false)
		if err != nil {
			return nil, err
		}
		summary.AffCode = user.AffCode
	}
	summary.InviteeCount, err = model.CountAffiliateInvitees(userId)
	if err != nil {
		return nil, err
	}
	return summary, nil
}

func GetSelfAffiliate(c *gin.Context) {
	summary, err := buildAffiliateSummary(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}

func GetSelfAffiliateCommissions(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	commissions, total, err := model.ListAffiliateCommissions(c.GetInt("id"), pageInfo, true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(commissions)
	common.ApiSuccess(c, pageInfo)
}

// GetSelfAffiliateInvitees pages the users the caller invited, with totals
// over all of them. It answers even when the program is off, because users
// invited earlier stay the caller's invitees.
func GetSelfAffiliateInvitees(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	invitees, total, err := model.ListAffiliateInvitees(userId, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	totals, err := model.SumAffiliateInvitees(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(invitees)
	common.ApiSuccess(c, gin.H{
		"page": pageInfo.Page, "page_size": pageInfo.PageSize, "total": pageInfo.Total,
		"items": pageInfo.Items, "totals": totals,
	})
}

type affiliateTransferRequest struct {
	Quota int `json:"quota"`
}

// TransferSelfAffiliate moves commission into the user's wallet.
func TransferSelfAffiliate(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	var req affiliateTransferRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil || req.Quota <= 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	if err := model.TransferAffiliateBalance(c.GetInt("id"), req.Quota); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccessT(c, "Transfer successful", nil)
}

func GetSelfAffiliateWithdrawals(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	withdrawals, total, err := model.ListAffiliateWithdrawals(c.GetInt("id"), "", pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(withdrawals)
	common.ApiSuccess(c, pageInfo)
}

type affiliateWithdrawalRequest struct {
	Quota   int64  `json:"quota"`
	Account string `json:"account"`
}

// RequestSelfAffiliateWithdrawal queues a channel's payout for an
// administrator.
func RequestSelfAffiliateWithdrawal(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	var req affiliateWithdrawalRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil || req.Quota <= 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	withdrawal, err := model.RequestAffiliateWithdrawal(c.GetInt("id"), req.Quota, req.Account)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, withdrawal)
}

// affiliateManagedUser loads the user an administrator acts on, refusing one
// at or above the administrator's own role.
func affiliateManagedUser(c *gin.Context) (*model.User, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return nil, false
	}
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return nil, false
	}
	if !canManageTargetRole(c.GetInt("role"), user.Role) {
		common.ApiErrorT(c, "No permission to access users of same or higher level")
		return nil, false
	}
	return user, true
}

type adminAffiliateView struct {
	*affiliateSummary
	MaxRate     int    `json:"max_rate"`
	InviterId   int    `json:"inviter_id"`
	InviterName string `json:"inviter_name"`
}

func buildAdminAffiliateView(user *model.User) (*adminAffiliateView, error) {
	summary, err := buildAffiliateSummary(user.Id)
	if err != nil {
		return nil, err
	}
	view := &adminAffiliateView{
		affiliateSummary: summary,
		MaxRate:          operation_setting.GetAffiliateSetting().MaxRate,
		InviterId:        user.InviterId,
	}
	if user.InviterId != 0 {
		if inviter, err := model.GetUserById(user.InviterId, false); err == nil {
			view.InviterName = inviter.Username
		}
	}
	return view, nil
}

func AdminGetUserAffiliate(c *gin.Context) {
	user, ok := affiliateManagedUser(c)
	if !ok {
		return
	}
	view, err := buildAdminAffiliateView(user)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, view)
}

type adminAffiliateRequest struct {
	Rate    int  `json:"rate"`
	Channel bool `json:"channel"`
}

// AdminSetUserAffiliate sets a user's commission rate, up to the configured
// maximum, and the promotion-channel mark.
func AdminSetUserAffiliate(c *gin.Context) {
	user, ok := affiliateManagedUser(c)
	if !ok {
		return
	}
	var req adminAffiliateRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	maxRate := operation_setting.GetAffiliateSetting().MaxRate
	if req.Rate < 0 || req.Rate > maxRate {
		common.ApiErrorT(c, "Commission rate must be between 0 and {{max}}%", map[string]any{"max": maxRate})
		return
	}
	if _, err := model.SetAffiliate(user.Id, req.Rate, req.Channel, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, user.Id, "user.manage", map[string]any{
		"username":          user.Username,
		"id":                user.Id,
		"action":            "set_affiliate",
		"affiliate_rate":    req.Rate,
		"affiliate_channel": req.Channel,
	})
	view, err := buildAdminAffiliateView(user)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, view)
}

func AdminGetUserAffiliateCommissions(c *gin.Context) {
	user, ok := affiliateManagedUser(c)
	if !ok {
		return
	}
	pageInfo := common.GetPageQuery(c)
	commissions, total, err := model.ListAffiliateCommissions(user.Id, pageInfo, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(commissions)
	common.ApiSuccess(c, pageInfo)
}

func AdminGetAffiliateWithdrawals(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	withdrawals, total, err := model.ListAffiliateWithdrawals(0, c.Query("status"), pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(withdrawals)
	common.ApiSuccess(c, pageInfo)
}

type adminAffiliateWithdrawalRequest struct {
	Note string `json:"note"`
}

// AdminPayAffiliateWithdrawal records that a pending withdrawal was paid
// out offline.
func AdminPayAffiliateWithdrawal(c *gin.Context) {
	processAffiliateWithdrawal(c, true)
}

// AdminRejectAffiliateWithdrawal rejects a pending withdrawal and returns
// its quota to the channel's balance.
func AdminRejectAffiliateWithdrawal(c *gin.Context) {
	processAffiliateWithdrawal(c, false)
}

func processAffiliateWithdrawal(c *gin.Context, paid bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	var req adminAffiliateWithdrawalRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil && !errors.Is(err, io.EOF) {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	withdrawal, err := model.ProcessAffiliateWithdrawal(id, paid, c.GetInt("id"), req.Note)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	action := "reject_affiliate_withdrawal"
	if paid {
		action = "pay_affiliate_withdrawal"
	}
	username := ""
	if owner, err := model.GetUserById(withdrawal.UserId, false); err == nil {
		username = owner.Username
	}
	recordManageAuditFor(c, withdrawal.UserId, "user.manage", map[string]any{
		"username":      username,
		"id":            withdrawal.UserId,
		"action":        action,
		"withdrawal_id": withdrawal.Id,
		"quota":         withdrawal.Quota,
		"money":         withdrawal.Money,
	})
	common.ApiSuccess(c, withdrawal)
}
