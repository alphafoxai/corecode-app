package service

import (
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

// affiliateGiftMailZone dates a gift's end in the zone of the customers, who
// are in mainland China. A fixed offset needs no time zone database.
var affiliateGiftMailZone = time.FixedZone("UTC+8", 8*60*60)

// NotifyAffiliateGift tells an invitee by email that their inviter gave them
// a plan, in lang (see AccountMailLanguage). An invitee without an email
// address gets nothing. The gift is already committed, so the caller only
// records a failure.
func NotifyAffiliateGift(lang string, invitee *model.User, inviter *model.User, plan *model.SubscriptionPlan, subscription *model.UserSubscription) error {
	if invitee.Email == "" {
		return nil
	}
	inviterName := inviter.DisplayName
	if inviterName == "" {
		inviterName = inviter.Username
	}
	subject, content := affiliateGiftMail(lang, inviterName, plan, subscription.EndTime)
	return common.SendEmail(subject, invitee.Email, content)
}

// affiliateGiftMail renders the gift notice. The inviter's name and the
// plan's texts are escaped, because an inviter chooses their own name.
func affiliateGiftMail(lang string, inviterName string, plan *model.SubscriptionPlan, endTime int64) (string, string) {
	server := strings.TrimSuffix(system_setting.ServerAddress, "/")
	args := map[string]any{
		"SystemName": html.EscapeString(common.SystemName),
		"Inviter":    html.EscapeString(inviterName),
		"Plan":       html.EscapeString(plan.Title),
		"Server":     server,
	}
	subject := i18n.Translate(lang, i18n.MsgEmailAffiliateGiftSubject, map[string]any{"SystemName": common.SystemName, "Plan": plan.Title})

	const detailRow = `<tr><td style="padding:12px 0;border-top:1px solid #e8e6dc;color:#5e5d59;width:96px;vertical-align:top">%s</td>` +
		`<td style="padding:12px 0;border-top:1px solid #e8e6dc;color:#141413;font-weight:600">%s</td></tr>`
	var details strings.Builder
	planCell := html.EscapeString(plan.Title)
	if plan.Subtitle != "" {
		planCell += `<div style="margin-top:2px;color:#5e5d59;font-size:13px;font-weight:400">` + html.EscapeString(plan.Subtitle) + `</div>`
	}
	fmt.Fprintf(&details, detailRow, i18n.Translate(lang, i18n.MsgEmailAffiliateGiftPlan), planCell)
	if plan.TotalAmount > 0 {
		quota := logger.FormatQuota(int(plan.TotalAmount))
		if strings.Contains(quota, ".") {
			quota = strings.TrimSuffix(strings.TrimRight(quota, "0"), ".")
		}
		fmt.Fprintf(&details, detailRow, i18n.Translate(lang, i18n.MsgEmailAffiliateGiftQuota), quota)
	}
	validUntil := i18n.Translate(lang, i18n.MsgEmailAffiliateGiftValidUntilValue, map[string]any{
		"Time": time.Unix(endTime, 0).In(affiliateGiftMailZone).Format("2006-01-02 15:04"),
	})
	fmt.Fprintf(&details, detailRow, i18n.Translate(lang, i18n.MsgEmailAffiliateGiftValidUntil), validUntil)

	content := fmt.Sprintf(`<div style="margin:0;padding:32px 16px;background:#faf9f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue','PingFang SC','Microsoft YaHei',sans-serif;color:#141413;line-height:1.6">`+
		`<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e8e6dc;border-radius:12px;overflow:hidden">`+
		`<div style="padding:20px 32px;border-bottom:3px solid #b5532f;font-size:18px;font-weight:700;color:#b5532f">%s</div>`+
		`<div style="padding:28px 32px">`+
		`<h1 style="margin:0 0 16px;font-size:22px;line-height:1.4;font-weight:700;color:#141413">%s</h1>`+
		`<p style="margin:0 0 20px;font-size:15px">%s</p>`+
		`<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;border-collapse:collapse;font-size:14px">%s</table>`+
		`<div style="margin:28px 0"><a href="%s/wallet" style="display:inline-block;padding:12px 28px;background:#b5532f;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">%s</a></div>`+
		`<div style="padding:16px 20px;background:#f0eee6;border-radius:8px;font-size:14px">`+
		`<div style="margin-bottom:8px;font-weight:700">%s</div>`+
		`<ol style="margin:0;padding-left:20px"><li style="margin:4px 0">%s</li><li style="margin:4px 0">%s</li><li style="margin:4px 0">%s</li></ol>`+
		`</div></div>`+
		`<div style="padding:16px 32px 24px;color:#5e5d59;font-size:12px">%s</div>`+
		`</div></div>`,
		args["SystemName"],
		i18n.Translate(lang, i18n.MsgEmailAffiliateGiftHeading, args),
		i18n.Translate(lang, i18n.MsgEmailAffiliateGiftIntro, args),
		details.String(),
		server,
		i18n.Translate(lang, i18n.MsgEmailAffiliateGiftButton),
		i18n.Translate(lang, i18n.MsgEmailAffiliateGiftStepsTitle),
		i18n.Translate(lang, i18n.MsgEmailAffiliateGiftStepKey, args),
		i18n.Translate(lang, i18n.MsgEmailAffiliateGiftStepSetup, args),
		i18n.Translate(lang, i18n.MsgEmailAffiliateGiftStepUse),
		i18n.Translate(lang, i18n.MsgEmailAffiliateGiftFooter, args))
	return subject, content
}
