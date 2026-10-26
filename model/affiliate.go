package model

import (
	"errors"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Affiliate is a user who may invite others and earn commission on what the
// invitees pay for. Rate is the percent of a direct invitee's paid
// consumption the affiliate earns. Channel marks a promotion channel, which
// also earns the second-level rate from the users its invitees invite.
//
// Balance is commission not yet transferred or withdrawn and Earned is
// everything ever credited, both in quota units. They are kept apart from
// users.aff_quota, which holds upstream's fixed sign-up reward.
type Affiliate struct {
	Id        int   `json:"id"`
	UserId    int   `json:"user_id" gorm:"uniqueIndex"`
	Rate      int   `json:"rate" gorm:"not null"`
	Channel   bool  `json:"channel" gorm:"not null"`
	GrantedBy int   `json:"granted_by" gorm:"not null"` // 0 when the user applied in the wallet
	Balance   int64 `json:"balance" gorm:"type:bigint;not null;default:0"`
	Earned    int64 `json:"earned" gorm:"type:bigint;not null;default:0"`
	CreatedAt int64 `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt int64 `json:"updated_at" gorm:"autoUpdateTime"`
}

// AffiliateReferral tracks how far one invitee's consumption has been
// settled. UsedMark is the invitee's used_quota at the last settlement and
// Base the consumption commissioned so far. Base never exceeds what the
// invitee paid after PaidCentsAtStart, so bonus, discount and gifted quota
// earn nothing in total, and payments made before the referral started
// counting earn nothing at all.
type AffiliateReferral struct {
	Id               int   `json:"id"`
	UserId           int   `json:"user_id" gorm:"uniqueIndex"`
	UsedMark         int64 `json:"used_mark" gorm:"type:bigint;not null;default:0"`
	Base             int64 `json:"base" gorm:"type:bigint;not null;default:0"`
	PaidCentsAtStart int64 `json:"paid_cents_at_start" gorm:"type:bigint;not null;default:0"`
	CreatedAt        int64 `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt        int64 `json:"updated_at" gorm:"autoUpdateTime"`
}

// AffiliateCommission is one credit to an affiliate: Rate percent of Base,
// the source user's newly settled paid consumption.
type AffiliateCommission struct {
	Id           int    `json:"id"`
	UserId       int    `json:"user_id" gorm:"index"`
	SourceUserId int    `json:"source_user_id" gorm:"index"`
	SourceName   string `json:"source_name" gorm:"-:all"`
	Level        int    `json:"level"` // 1: a direct invitee; 2: an invitee's invitee
	Rate         int    `json:"rate"`
	Base         int64  `json:"base" gorm:"type:bigint"`
	Amount       int64  `json:"amount" gorm:"type:bigint"`
	CreatedAt    int64  `json:"created_at" gorm:"autoCreateTime"`
}

// AffiliateWithdrawal is a channel's request to be paid out of its balance.
// The quota leaves the balance when the request is made and returns if an
// administrator rejects it; Money is the payout at the price of that moment.
type AffiliateWithdrawal struct {
	Id          int     `json:"id"`
	UserId      int     `json:"user_id" gorm:"index"`
	Username    string  `json:"username" gorm:"-:all"`
	Quota       int64   `json:"quota" gorm:"type:bigint;not null"`
	Money       float64 `json:"money"`
	Account     string  `json:"account" gorm:"type:varchar(255)"`
	Status      string  `json:"status" gorm:"type:varchar(16);index"`
	Note        string  `json:"note" gorm:"type:varchar(255)"`
	CreatedAt   int64   `json:"created_at" gorm:"autoCreateTime"`
	ProcessedAt int64   `json:"processed_at"`
	ProcessedBy int     `json:"processed_by"`
}

const (
	AffiliateWithdrawalPending  = "pending"
	AffiliateWithdrawalPaid     = "paid"
	AffiliateWithdrawalRejected = "rejected"

	affiliateAccountMaxLen = 255
	affiliateNoteMaxLen    = 255
)

// The affiliate errors reach the web console, so they carry message keys.
var (
	ErrAffiliateNotFound            error = common.NewMessage("You do not have an invitation code")
	ErrAffiliateBalanceInsufficient error = common.NewMessage("Commission balance is insufficient")
	ErrAffiliateNotChannel          error = common.NewMessage("Only promotion channels can withdraw commission")
	ErrAffiliateWithdrawalTooSmall  error = common.NewMessage("The withdrawal is below the minimum amount")
	ErrAffiliateAccountInvalid      error = common.NewMessage("Enter the account to receive the payout")
	ErrAffiliateWithdrawalProcessed error = common.NewMessage("This withdrawal has already been processed")
	ErrAffiliateInviterInvalid      error = common.NewMessage("This user cannot be the inviter")
	ErrAffiliateInviterLoop         error = common.NewMessage("This user was invited, directly or indirectly, by the user being changed")
	ErrAffiliateGiftUnavailable     error = common.NewMessage("No plan is available to gift")
	ErrAffiliateGiftNotInvitee      error = common.NewMessage("This user is not your invitee")
	ErrAffiliateGiftTaken           error = common.NewMessage("This invitee already has this plan")
)

// InviterIdForAffCode resolves the account a sign-up's invite code binds to,
// or 0. With the invitation program on, an enabled user's code binds unless an
// administrator set their rate to 0, so a code that earns nothing never
// creates a relationship; with it off, any user's code binds as it always has.
func InviterIdForAffCode(affCode string) int {
	affCode = strings.TrimSpace(affCode)
	if affCode == "" || len(affCode) > 32 {
		return 0
	}
	var inviter User
	if err := DB.Select("id", "status").Where("aff_code = ?", affCode).First(&inviter).Error; err != nil {
		return 0
	}
	if !operation_setting.GetAffiliateSetting().Enabled {
		return inviter.Id
	}
	if inviter.Status != common.UserStatusEnabled {
		return 0
	}
	if err := EnsureDefaultAffiliate(inviter.Id); err != nil {
		return 0
	}
	var count int64
	if err := DB.Model(&Affiliate{}).Where("user_id = ? AND rate > 0", inviter.Id).Count(&count).Error; err != nil || count == 0 {
		return 0
	}
	return inviter.Id
}

// createAffiliateReferralWithTx starts counting a new user's consumption for
// their inviter from zero, in the transaction that creates the user. While
// the program is off nothing is created; a referral found later starts at the
// consumption and payments of that moment instead.
func createAffiliateReferralWithTx(tx *gorm.DB, userId int, inviterId int) error {
	if inviterId == 0 || !operation_setting.GetAffiliateSetting().Enabled {
		return nil
	}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&AffiliateReferral{UserId: userId}).Error
}

// AffiliatePaidMoney sums what a user paid through payment gateways, in the
// payment currency. Purchases paid from the wallet are excluded because that
// money was counted when the wallet was topped up.
func AffiliatePaidMoney(tx *gorm.DB, userId int) (float64, error) {
	var total float64
	err := tx.Model(&TopUp{}).
		Where("user_id = ? AND status = ? AND (payment_provider IS NULL OR payment_provider <> ?)", userId, common.TopUpStatusSuccess, PaymentProviderBalance).
		Select("COALESCE(SUM(money), 0)").Scan(&total).Error
	return total, err
}

func affiliatePaidCents(tx *gorm.DB, userId int) (int64, error) {
	money, err := AffiliatePaidMoney(tx, userId)
	if err != nil {
		return 0, err
	}
	return decimal.NewFromFloat(money).Mul(decimal.NewFromInt(100)).Round(0).IntPart(), nil
}

// affiliatePrice is the payment-currency price of one unit of quota display
// currency, the same price top-ups are charged at.
func affiliatePrice() decimal.Decimal {
	if operation_setting.Price <= 0 {
		return decimal.NewFromInt(1)
	}
	return decimal.NewFromFloat(operation_setting.Price)
}

// affiliateQuotaFromCents converts payments to the quota they buy at list
// price, without any discount or bonus.
func affiliateQuotaFromCents(cents int64) (int64, error) {
	quota, err := common.WalletQuotaFromDecimalStrict(
		decimal.NewFromInt(cents).Div(decimal.NewFromInt(100)).Div(affiliatePrice()).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Floor(),
	)
	return int64(quota), err
}

// AffiliateMoneyFromQuota prices commission quota in the payment currency,
// rounded down to the cent.
func AffiliateMoneyFromQuota(quota int64) float64 {
	return decimal.NewFromInt(quota).Div(decimal.NewFromFloat(common.QuotaPerUnit)).Mul(affiliatePrice()).RoundFloor(2).InexactFloat64()
}

func affiliateCommissionAmount(base int64, rate int) (int64, error) {
	amount, err := common.WalletQuotaFromDecimalStrict(decimal.NewFromInt(base).Mul(decimal.NewFromInt(int64(rate))).Div(decimal.NewFromInt(100)).Floor())
	return int64(amount), err
}

type affiliateCredit struct {
	userId int
	level  int
	rate   int
}

// affiliateCreditsFor lists who earns from an invitee's consumption: the
// inviter at their own rate, and the inviter's inviter at the second-level
// rate when that account is a channel. Disabled accounts earn nothing.
func affiliateCreditsFor(tx *gorm.DB, inviterId int) ([]affiliateCredit, error) {
	if inviterId == 0 {
		return nil, nil
	}
	var inviter User
	if err := tx.Select("id", "status", "inviter_id").Where("id = ?", inviterId).First(&inviter).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	var credits []affiliateCredit
	if inviter.Status == common.UserStatusEnabled {
		// An inviter from before the default rate gets it at their first settlement.
		if err := ensureDefaultAffiliateWithTx(tx, inviter.Id); err != nil {
			return nil, err
		}
		var affiliate Affiliate
		err := tx.Where("user_id = ?", inviter.Id).First(&affiliate).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		if err == nil && affiliate.Rate > 0 {
			credits = append(credits, affiliateCredit{userId: inviter.Id, level: 1, rate: affiliate.Rate})
		}
	}
	secondLevelRate := operation_setting.GetAffiliateSetting().SecondLevelRate
	if inviter.InviterId == 0 || inviter.InviterId == inviter.Id || secondLevelRate <= 0 {
		return credits, nil
	}
	var channel User
	err := tx.Select("id", "status").Where("id = ?", inviter.InviterId).First(&channel).Error
	if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && channel.Status != common.UserStatusEnabled) {
		return credits, nil
	}
	if err != nil {
		return nil, err
	}
	var count int64
	if err := tx.Model(&Affiliate{}).Where("user_id = ? AND channel = ?", channel.Id, true).Count(&count).Error; err != nil {
		return nil, err
	}
	if count > 0 {
		credits = append(credits, affiliateCredit{userId: channel.Id, level: 2, rate: secondLevelRate})
	}
	return credits, nil
}

// SettleAffiliateReferral credits the commission one invitee's new
// consumption has earned since the last settlement and reports whether
// anything was credited. The referral row is locked and its marks move in the
// same transaction as the credits, so repeated or concurrent runs pay once.
//
// Consumption counts only up to what the invitee paid; with the program off
// or an ineligible inviter it still counts, it just earns nothing.
func SettleAffiliateReferral(userId int) (bool, error) {
	credited := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var referral AffiliateReferral
		if err := lockForUpdate(tx).Where("user_id = ?", userId).First(&referral).Error; err != nil {
			return err
		}
		var invitee User
		if err := tx.Select("id", "used_quota", "inviter_id").Where("id = ?", userId).First(&invitee).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		used := int64(invitee.UsedQuota)
		if used <= referral.UsedMark {
			return nil
		}
		consumed := used - referral.UsedMark
		referral.UsedMark = used
		paidCents, err := affiliatePaidCents(tx, userId)
		if err != nil {
			return err
		}
		paidQuota, err := affiliateQuotaFromCents(max(paidCents-referral.PaidCentsAtStart, 0))
		if err != nil {
			return err
		}
		base := max(min(consumed, paidQuota-referral.Base), 0)
		referral.Base += base
		if err := tx.Model(&referral).Select("used_mark", "base", "updated_at").Updates(&referral).Error; err != nil {
			return err
		}
		if base == 0 || !operation_setting.GetAffiliateSetting().Enabled {
			return nil
		}
		credits, err := affiliateCreditsFor(tx, invitee.InviterId)
		if err != nil {
			return err
		}
		for _, credit := range credits {
			amount, err := affiliateCommissionAmount(base, credit.rate)
			if err != nil {
				return err
			}
			if amount <= 0 {
				continue
			}
			if err := tx.Model(&Affiliate{}).Where("user_id = ?", credit.userId).Updates(map[string]any{
				"balance": gorm.Expr("balance + ?", amount),
				"earned":  gorm.Expr("earned + ?", amount),
			}).Error; err != nil {
				return err
			}
			if err := tx.Create(&AffiliateCommission{
				UserId:       credit.userId,
				SourceUserId: userId,
				Level:        credit.level,
				Rate:         credit.rate,
				Base:         base,
				Amount:       amount,
			}).Error; err != nil {
				return err
			}
			credited = true
		}
		return nil
	})
	return credited, err
}

// AffiliateReferralsToSettle returns, in referral order after afterId, up to
// limit invitees whose consumption grew since their last settlement, with
// the referral id to continue from.
func AffiliateReferralsToSettle(afterId int, limit int) ([]int, int, error) {
	var rows []struct {
		Id     int
		UserId int
	}
	err := DB.Table("affiliate_referrals").
		Select("affiliate_referrals.id, affiliate_referrals.user_id").
		Joins("JOIN users ON users.id = affiliate_referrals.user_id").
		Where("affiliate_referrals.id > ? AND users.used_quota > affiliate_referrals.used_mark AND users.deleted_at IS NULL", afterId).
		Order("affiliate_referrals.id").Limit(limit).
		Scan(&rows).Error
	if err != nil || len(rows) == 0 {
		return nil, afterId, err
	}
	userIds := make([]int, 0, len(rows))
	for _, row := range rows {
		userIds = append(userIds, row.UserId)
	}
	return userIds, rows[len(rows)-1].Id, nil
}

// StartMissingAffiliateReferrals begins counting for invitees who have no
// referral yet: users invited while the program was off, or before it
// existed. Each starts at its current consumption and payments, so nothing
// from before earns commission. It returns how many it started.
func StartMissingAffiliateReferrals(limit int) (int, error) {
	var users []User
	if err := DB.Select("id", "used_quota").
		Where("inviter_id > 0 AND id NOT IN (SELECT user_id FROM affiliate_referrals)").
		Order("id").Limit(limit).Find(&users).Error; err != nil {
		return 0, err
	}
	for _, user := range users {
		paidCents, err := affiliatePaidCents(DB, user.Id)
		if err != nil {
			return 0, err
		}
		if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&AffiliateReferral{
			UserId:           user.Id,
			UsedMark:         int64(user.UsedQuota),
			PaidCentsAtStart: paidCents,
		}).Error; err != nil {
			return 0, err
		}
	}
	return len(users), nil
}

// GetAffiliate returns a user's affiliate row, or nil when they have none.
func GetAffiliate(userId int) (*Affiliate, error) {
	var affiliate Affiliate
	err := DB.Where("user_id = ?", userId).First(&affiliate).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &affiliate, nil
}

// ensureAffCodeWithTx gives a user the invite code an affiliate shares.
// Every account created since codes existed has one; older ones may not.
func ensureAffCodeWithTx(tx *gorm.DB, userId int) error {
	var user User
	if err := tx.Select("id", "aff_code").Where("id = ?", userId).First(&user).Error; err != nil {
		return err
	}
	if user.AffCode != "" {
		return nil
	}
	return tx.Model(&User{}).Where("id = ?", userId).Update("aff_code", common.GetRandomString(4)).Error
}

// ensureDefaultAffiliateWithTx gives a user the default rate while the
// program is on: every customer can invite without applying. An existing
// row, including one an administrator set to rate 0, is left alone, so a
// revoked user stays revoked. The rate is fixed when the row is created.
func ensureDefaultAffiliateWithTx(tx *gorm.DB, userId int) error {
	setting := operation_setting.GetAffiliateSetting()
	if !setting.Enabled || setting.SelfServeRate <= 0 {
		return nil
	}
	if err := ensureAffCodeWithTx(tx, userId); err != nil {
		return err
	}
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Affiliate{UserId: userId, Rate: setting.SelfServeRate}).Error
}

// EnsureDefaultAffiliate is ensureDefaultAffiliateWithTx in its own
// transaction.
func EnsureDefaultAffiliate(userId int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		return ensureDefaultAffiliateWithTx(tx, userId)
	})
}

// SetAffiliate is the administrator's grant: any rate up to the configured
// maximum, and the channel mark. Rate 0 removes invite rights and also keeps
// the user from applying in the wallet; the balance is kept.
func SetAffiliate(userId int, rate int, channel bool, adminId int) (*Affiliate, error) {
	var affiliate Affiliate
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := ensureAffCodeWithTx(tx, userId); err != nil {
			return err
		}
		err := lockForUpdate(tx).Where("user_id = ?", userId).First(&affiliate).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			affiliate = Affiliate{UserId: userId, Rate: rate, Channel: channel, GrantedBy: adminId}
			return tx.Create(&affiliate).Error
		}
		if err != nil {
			return err
		}
		affiliate.Rate = rate
		affiliate.Channel = channel
		affiliate.GrantedBy = adminId
		return tx.Model(&affiliate).Select("rate", "channel", "granted_by", "updated_at").Updates(&affiliate).Error
	})
	if err != nil {
		return nil, err
	}
	return &affiliate, nil
}

// CountAffiliateInvitees counts the users bound to an inviter.
func CountAffiliateInvitees(userId int) (int64, error) {
	var count int64
	err := DB.Model(&User{}).Where("inviter_id = ?", userId).Count(&count).Error
	return count, err
}

// AffiliateInvitee is one user who signed up with the affiliate's code, as
// the affiliate sees them: who they are, everything they have consumed, the
// direct commission their consumption has earned the affiliate, and whether
// they hold the gift plan. GiftPlan is "gifted" when an inviter gave it,
// "owned" when they got it another way, and empty when they can be given it.
type AffiliateInvitee struct {
	Id         int    `json:"id"`
	Name       string `json:"name"`
	Email      string `json:"email"`
	CreatedAt  int64  `json:"created_at"`
	UsedQuota  int64  `json:"used_quota"`
	Commission int64  `json:"commission"`
	GiftPlan   string `json:"gift_plan"`
}

// AffiliateInviteeTotals sums AffiliateInvitee over every invitee.
type AffiliateInviteeTotals struct {
	UsedQuota  int64 `json:"used_quota"`
	Commission int64 `json:"commission"`
}

// ListAffiliateInvitees pages the users an affiliate invited, newest first.
// Commission counts only first-level credits, so a channel's second-level
// earnings are not attributed to the invitee who brought those users in.
func ListAffiliateInvitees(userId int, pageInfo *common.PageInfo) ([]*AffiliateInvitee, int64, error) {
	total, err := CountAffiliateInvitees(userId)
	if err != nil {
		return nil, 0, err
	}
	var users []User
	if err := DB.Select("id", "username", "email", "created_at", "used_quota").Where("inviter_id = ?", userId).
		Order("id desc").Offset(pageInfo.GetStartIdx()).Limit(pageInfo.GetPageSize()).Find(&users).Error; err != nil {
		return nil, 0, err
	}
	ids := make([]int, 0, len(users))
	for _, user := range users {
		ids = append(ids, user.Id)
	}
	commissions := make(map[int]int64, len(users))
	if len(ids) > 0 {
		var rows []struct {
			SourceUserId int
			Amount       int64
		}
		if err := DB.Model(&AffiliateCommission{}).Select("source_user_id, COALESCE(SUM(amount), 0) AS amount").
			Where("user_id = ? AND level = 1 AND source_user_id IN ?", userId, ids).
			Group("source_user_id").Scan(&rows).Error; err != nil {
			return nil, 0, err
		}
		for _, row := range rows {
			commissions[row.SourceUserId] = row.Amount
		}
	}
	giftPlans := make(map[int]string, len(users))
	if planId := operation_setting.GetAffiliateSetting().GiftPlanId; planId > 0 && len(ids) > 0 {
		var subscriptions []UserSubscription
		if err := DB.Select("user_id", "source").Where("plan_id = ? AND user_id IN ?", planId, ids).
			Find(&subscriptions).Error; err != nil {
			return nil, 0, err
		}
		for _, subscription := range subscriptions {
			if subscription.Source == SubscriptionSourceAffiliateGift {
				giftPlans[subscription.UserId] = "gifted"
			} else if giftPlans[subscription.UserId] == "" {
				giftPlans[subscription.UserId] = "owned"
			}
		}
	}
	invitees := make([]*AffiliateInvitee, 0, len(users))
	for _, user := range users {
		invitees = append(invitees, &AffiliateInvitee{
			Id:         user.Id,
			Name:       user.Username,
			Email:      user.Email,
			CreatedAt:  user.CreatedAt,
			UsedQuota:  int64(user.UsedQuota),
			Commission: commissions[user.Id],
			GiftPlan:   giftPlans[user.Id],
		})
	}
	return invitees, total, nil
}

// SumAffiliateInvitees totals the same figures ListAffiliateInvitees pages.
func SumAffiliateInvitees(userId int) (AffiliateInviteeTotals, error) {
	var totals AffiliateInviteeTotals
	if err := DB.Model(&User{}).Where("inviter_id = ?", userId).
		Select("COALESCE(SUM(used_quota), 0)").Scan(&totals.UsedQuota).Error; err != nil {
		return totals, err
	}
	err := DB.Model(&AffiliateCommission{}).Where("user_id = ? AND level = 1", userId).
		Select("COALESCE(SUM(amount), 0)").Scan(&totals.Commission).Error
	return totals, err
}

// AffiliateGiftPlan returns the plan inviters can gift, or nil when gifting
// is off or the configured plan is disabled or gone.
func AffiliateGiftPlan() (*SubscriptionPlan, error) {
	planId := operation_setting.GetAffiliateSetting().GiftPlanId
	if planId <= 0 {
		return nil, nil
	}
	plan, err := GetSubscriptionPlanById(planId)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !plan.Enabled {
		return nil, nil
	}
	return plan, nil
}

// GiftAffiliatePlan gives one of an inviter's invitees the gift plan, free.
// An invitee who already has the plan, gifted or bought, cannot be given it,
// and one who was given it cannot buy it; the invitee's row is locked first,
// as purchases lock it, so a gift and a purchase cannot both pass the check.
func GiftAffiliatePlan(inviterId int, inviteeId int) (*SubscriptionPlan, error) {
	plan, err := AffiliateGiftPlan()
	if err != nil {
		return nil, err
	}
	if plan == nil {
		return nil, ErrAffiliateGiftUnavailable
	}
	groupChanged := false
	var invitee User
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Select("id", "username", "inviter_id").Where("id = ?", inviteeId).First(&invitee).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAffiliateGiftNotInvitee
			}
			return err
		}
		if inviterId == 0 || invitee.InviterId != inviterId {
			return ErrAffiliateGiftNotInvitee
		}
		var count int64
		if err := tx.Model(&UserSubscription{}).Where("user_id = ? AND plan_id = ?", inviteeId, plan.Id).
			Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrAffiliateGiftTaken
		}
		subscription, err := CreateUserSubscriptionFromPlanTx(tx, inviteeId, plan, SubscriptionSourceAffiliateGift)
		if err != nil {
			return err
		}
		groupChanged = subscription.PrevUserGroup != ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	if groupChanged {
		refreshSubscriptionUserGroupCache(inviteeId, common.LogText("affiliate plan gift"))
	}
	RecordLog(inviteeId, LogTypeSystem, common.NewMessage("Your inviter gave you the plan {{plan}}", map[string]any{"plan": plan.Title}))
	RecordLog(inviterId, LogTypeSystem, common.NewMessage("You gave {{user}} the plan {{plan}}", map[string]any{"user": invitee.Username, "plan": plan.Title}))
	return plan, nil
}

// SetUserInviter is the administrator's change of who invited a user; 0
// clears it. Commission follows the new inviter from the change on: a
// referral already counting keeps its marks, a user without one gets one at
// the next settlement starting from that moment, and commission already
// credited stays with whoever earned it. The new inviter must exist and must
// not be the user or anyone the user invited, directly or through others.
func SetUserInviter(userId int, inviterId int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if inviterId != 0 {
			if inviterId == userId {
				return ErrAffiliateInviterInvalid
			}
			ancestorId := inviterId
			// The bound only stops a loop that existing data already contains.
			for range 64 {
				if ancestorId == 0 {
					break
				}
				if ancestorId == userId {
					return ErrAffiliateInviterLoop
				}
				var ancestor User
				err := tx.Select("id", "inviter_id").Where("id = ?", ancestorId).First(&ancestor).Error
				if errors.Is(err, gorm.ErrRecordNotFound) && ancestorId == inviterId {
					return ErrAffiliateInviterInvalid
				}
				if errors.Is(err, gorm.ErrRecordNotFound) {
					break
				}
				if err != nil {
					return err
				}
				ancestorId = ancestor.InviterId
			}
		}
		var user User
		if err := lockForUpdate(tx).Select("id").Where("id = ?", userId).First(&user).Error; err != nil {
			return err
		}
		return tx.Model(&User{}).Where("id = ?", userId).Update("inviter_id", inviterId).Error
	})
}

// maskAffiliateName keeps the first two characters of a username, enough for
// an affiliate to recognize an invitee without exposing the account.
func maskAffiliateName(name string) string {
	runes := []rune(name)
	if len(runes) <= 2 {
		return string(runes[:min(len(runes), 1)]) + "***"
	}
	return string(runes[:2]) + "***"
}

// ListAffiliateCommissions pages an affiliate's credits, newest first, with
// each source user's name. The affiliate sees names masked; an administrator
// sees them whole.
func ListAffiliateCommissions(userId int, pageInfo *common.PageInfo, mask bool) ([]*AffiliateCommission, int64, error) {
	var total int64
	if err := DB.Model(&AffiliateCommission{}).Where("user_id = ?", userId).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var commissions []*AffiliateCommission
	if err := DB.Where("user_id = ?", userId).Order("id desc").
		Offset(pageInfo.GetStartIdx()).Limit(pageInfo.GetPageSize()).Find(&commissions).Error; err != nil {
		return nil, 0, err
	}
	sourceIds := make([]int, 0, len(commissions))
	for _, commission := range commissions {
		sourceIds = append(sourceIds, commission.SourceUserId)
	}
	names, err := affiliateUsernames(sourceIds)
	if err != nil {
		return nil, 0, err
	}
	for _, commission := range commissions {
		commission.SourceName = names[commission.SourceUserId]
		if mask {
			commission.SourceName = maskAffiliateName(commission.SourceName)
		}
	}
	return commissions, total, nil
}

func affiliateUsernames(ids []int) (map[int]string, error) {
	names := make(map[int]string, len(ids))
	if len(ids) == 0 {
		return names, nil
	}
	var users []User
	if err := DB.Unscoped().Select("id", "username").Where("id IN ?", ids).Find(&users).Error; err != nil {
		return nil, err
	}
	for _, user := range users {
		names[user.Id] = user.Username
	}
	return names, nil
}

// TransferAffiliateBalance moves commission into the user's own wallet.
func TransferAffiliateBalance(userId int, quota int) error {
	if float64(quota) < common.QuotaPerUnit {
		return common.NewMessage("Minimum transfer quota is {{min}}!", map[string]any{"min": logger.FormatQuota(common.QuotaFromFloat(common.QuotaPerUnit))})
	}
	err := DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&Affiliate{}).Where("user_id = ? AND balance >= ?", userId, quota).
			Update("balance", gorm.Expr("balance - ?", quota))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrAffiliateBalanceInsufficient
		}
		return creditTopUpQuota(tx, userId, quota, nil)
	})
	if err != nil {
		return err
	}
	syncCreditUserQuotaCache(userId, quota, common.LogText("affiliate commission transfer"))
	RecordLog(userId, LogTypeSystem, common.NewMessage("Commission transferred to balance {{quota}}", map[string]any{"quota": logger.FormatQuota(quota)}))
	return nil
}

// RequestAffiliateWithdrawal takes quota out of a channel's balance and
// queues it for an administrator to pay out offline.
func RequestAffiliateWithdrawal(userId int, quota int64, account string) (*AffiliateWithdrawal, error) {
	account = strings.TrimSpace(account)
	if account == "" || len(account) > affiliateAccountMaxLen {
		return nil, ErrAffiliateAccountInvalid
	}
	affiliate, err := GetAffiliate(userId)
	if err != nil {
		return nil, err
	}
	if affiliate == nil {
		return nil, ErrAffiliateNotFound
	}
	if !affiliate.Channel {
		return nil, ErrAffiliateNotChannel
	}
	money := AffiliateMoneyFromQuota(quota)
	if quota <= 0 || money < float64(operation_setting.GetAffiliateSetting().MinWithdrawal) || money <= 0 {
		return nil, ErrAffiliateWithdrawalTooSmall
	}
	withdrawal := &AffiliateWithdrawal{
		UserId:  userId,
		Quota:   quota,
		Money:   money,
		Account: account,
		Status:  AffiliateWithdrawalPending,
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&Affiliate{}).Where("user_id = ? AND balance >= ?", userId, quota).
			Update("balance", gorm.Expr("balance - ?", quota))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrAffiliateBalanceInsufficient
		}
		return tx.Create(withdrawal).Error
	})
	if err != nil {
		return nil, err
	}
	return withdrawal, nil
}

// ProcessAffiliateWithdrawal settles a pending withdrawal as paid or
// rejected. A rejection returns the quota to the balance in the same
// transaction; a request that is no longer pending is left unchanged.
func ProcessAffiliateWithdrawal(id int, paid bool, adminId int, note string) (*AffiliateWithdrawal, error) {
	note = strings.TrimSpace(note)
	if len(note) > affiliateNoteMaxLen {
		note = note[:affiliateNoteMaxLen]
	}
	status := AffiliateWithdrawalRejected
	if paid {
		status = AffiliateWithdrawalPaid
	}
	var withdrawal AffiliateWithdrawal
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("id = ?", id).First(&withdrawal).Error; err != nil {
			return err
		}
		result := tx.Model(&AffiliateWithdrawal{}).Where("id = ? AND status = ?", id, AffiliateWithdrawalPending).Updates(map[string]any{
			"status":       status,
			"note":         note,
			"processed_at": common.GetTimestamp(),
			"processed_by": adminId,
		})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrAffiliateWithdrawalProcessed
		}
		if !paid {
			if err := tx.Model(&Affiliate{}).Where("user_id = ?", withdrawal.UserId).
				Update("balance", gorm.Expr("balance + ?", withdrawal.Quota)).Error; err != nil {
				return err
			}
		}
		return tx.Where("id = ?", id).First(&withdrawal).Error
	})
	if err != nil {
		return nil, err
	}
	return &withdrawal, nil
}

// ListAffiliateWithdrawals pages withdrawals, newest first. userId 0 lists
// every user's; an empty status lists every status.
func ListAffiliateWithdrawals(userId int, status string, pageInfo *common.PageInfo) ([]*AffiliateWithdrawal, int64, error) {
	query := DB.Model(&AffiliateWithdrawal{})
	if userId > 0 {
		query = query.Where("user_id = ?", userId)
	}
	if status != "" {
		query = query.Where("status = ?", status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var withdrawals []*AffiliateWithdrawal
	if err := query.Order("id desc").Offset(pageInfo.GetStartIdx()).Limit(pageInfo.GetPageSize()).Find(&withdrawals).Error; err != nil {
		return nil, 0, err
	}
	if userId == 0 {
		ids := make([]int, 0, len(withdrawals))
		for _, withdrawal := range withdrawals {
			ids = append(ids, withdrawal.UserId)
		}
		names, err := affiliateUsernames(ids)
		if err != nil {
			return nil, 0, err
		}
		for _, withdrawal := range withdrawals {
			withdrawal.Username = names[withdrawal.UserId]
		}
	}
	return withdrawals, total, nil
}
