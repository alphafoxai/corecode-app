package model

import (
	"fmt"
	"os"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// affiliateDollar is one unit of display currency in quota; with price 1 it
// is also what ¥1 of payment buys at list price.
const affiliateDollar = 500000

func useAffiliateTestDB(t *testing.T, dialect string) {
	t.Helper()
	var driver gorm.Dialector
	connections := 8
	switch dialect {
	case "sqlite":
		driver = sqlite.Open(":memory:")
		connections = 1
	case "mysql":
		dsn := os.Getenv("TEST_MYSQL_DSN")
		if dsn == "" {
			t.Skip("TEST_MYSQL_DSN is not configured")
		}
		driver = mysql.Open(dsn)
	case "postgres":
		dsn := os.Getenv("TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("TEST_POSTGRES_DSN is not configured")
		}
		driver = postgres.Open(dsn)
	}
	db, err := gorm.Open(driver, &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(connections)
	var version string
	query := "SELECT version()"
	if dialect == "sqlite" {
		query = "SELECT sqlite_version()"
	}
	require.NoError(t, db.Raw(query).Scan(&version).Error)
	t.Logf("database version: %s", version)

	previousDB, previousLogDB := DB, LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousSetting, previousPrice, previousQuotaPerUnit := *operation_setting.GetAffiliateSetting(), operation_setting.Price, common.QuotaPerUnit
	DB, LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseType(dialect), common.DatabaseType(dialect))
	initCol()
	operation_setting.Price = 1
	common.QuotaPerUnit = affiliateDollar
	*operation_setting.GetAffiliateSetting() = operation_setting.AffiliateSetting{
		Enabled: true, SelfServeRate: 10, MaxRate: 30, SecondLevelRate: 5, MinWithdrawal: 100,
	}
	tables := []any{&User{}, &TopUp{}, &Log{}, &Affiliate{}, &AffiliateReferral{}, &AffiliateCommission{}, &AffiliateWithdrawal{},
		&SubscriptionPlan{}, &SubscriptionOrder{}, &UserSubscription{}}
	for _, table := range tables {
		require.False(t, db.Migrator().HasTable(table), "use an empty test database")
	}
	require.NoError(t, db.AutoMigrate(tables...))
	t.Cleanup(func() {
		require.NoError(t, db.Migrator().DropTable(tables...))
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		initCol()
		*operation_setting.GetAffiliateSetting() = previousSetting
		operation_setting.Price, common.QuotaPerUnit = previousPrice, previousQuotaPerUnit
		require.NoError(t, sqlDB.Close())
	})
}

func registerAffiliateTestUser(t *testing.T, name string, inviterCode string) *User {
	t.Helper()
	user := &User{Username: name, DisplayName: name, Role: common.RoleCommonUser, Status: common.UserStatusEnabled}
	require.NoError(t, user.Insert(InviterIdForAffCode(inviterCode)))
	require.NoError(t, DB.First(user, user.Id).Error)
	return user
}

func payAffiliateTestTopUp(t *testing.T, userId int, money float64, provider string) {
	t.Helper()
	require.NoError(t, DB.Create(&TopUp{
		UserId: userId, Money: money, Status: common.TopUpStatusSuccess, PaymentProvider: provider,
		TradeNo: fmt.Sprintf("aff-test-%d-%s", userId, common.GetRandomString(8)),
	}).Error)
}

func consumeAffiliateTestQuota(t *testing.T, userId int, dollars int) {
	t.Helper()
	require.NoError(t, DB.Model(&User{}).Where("id = ?", userId).
		Update("used_quota", gorm.Expr("used_quota + ?", dollars*affiliateDollar)).Error)
}

func affiliateTestBalance(t *testing.T, userId int) int64 {
	t.Helper()
	affiliate, err := GetAffiliate(userId)
	require.NoError(t, err)
	if affiliate == nil {
		return 0
	}
	return affiliate.Balance
}

type affiliateTestCredit struct {
	UserId int
	Level  int
	Rate   int
	Amount int64
}

func affiliateTestCredits(t *testing.T, sourceUserId int) []affiliateTestCredit {
	t.Helper()
	var commissions []AffiliateCommission
	require.NoError(t, DB.Where("source_user_id = ?", sourceUserId).Order("id").Find(&commissions).Error)
	credits := make([]affiliateTestCredit, 0, len(commissions))
	for _, commission := range commissions {
		credits = append(credits, affiliateTestCredit{commission.UserId, commission.Level, commission.Rate, commission.Amount})
	}
	return credits
}

func settleAffiliateTestUser(t *testing.T, userId int) {
	t.Helper()
	_, err := SettleAffiliateReferral(userId)
	require.NoError(t, err)
}

func TestAffiliateCommissionDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			useAffiliateTestDB(t, dialect)
			dollars := func(n int) int64 { return int64(n * affiliateDollar) }

			// A is a 30% promotion channel granted by an administrator.
			a := registerAffiliateTestUser(t, "aff_a", "")
			_, err := SetAffiliate(a.Id, 30, true, 1)
			require.NoError(t, err)

			// Every enabled user's code binds and gives them the default rate.
			stranger := registerAffiliateTestUser(t, "aff_stranger", "")
			assert.Equal(t, stranger.Id, InviterIdForAffCode(stranger.AffCode))
			strangerAffiliate, err := GetAffiliate(stranger.Id)
			require.NoError(t, err)
			require.NotNil(t, strangerAffiliate)
			assert.Equal(t, 10, strangerAffiliate.Rate)
			assert.Zero(t, InviterIdForAffCode("nope"))
			disabled := registerAffiliateTestUser(t, "aff_disabled", "")
			require.NoError(t, DB.Model(&User{}).Where("id = ?", disabled.Id).Update("status", common.UserStatusDisabled).Error)
			assert.Zero(t, InviterIdForAffCode(disabled.AffCode))

			b := registerAffiliateTestUser(t, "aff_b", a.AffCode)
			assert.Equal(t, a.Id, b.InviterId)
			var referral AffiliateReferral
			require.NoError(t, DB.Where("user_id = ?", b.Id).First(&referral).Error, "a sign-up with an affiliate's code starts counting at once")

			// B has the default 10% without paying or applying.
			require.NoError(t, EnsureDefaultAffiliate(b.Id))
			require.NoError(t, EnsureDefaultAffiliate(b.Id), "ensuring twice keeps one row")
			bAffiliate, err := GetAffiliate(b.Id)
			require.NoError(t, err)
			assert.Equal(t, 10, bAffiliate.Rate)
			assert.False(t, bAffiliate.Channel)
			payAffiliateTestTopUp(t, b.Id, 60, PaymentProviderEpay)
			payAffiliateTestTopUp(t, b.Id, 500, PaymentProviderBalance)
			require.NoError(t, DB.Create(&TopUp{UserId: b.Id, Money: 900, Status: common.TopUpStatusPending, TradeNo: "aff-test-pending"}).Error)
			payAffiliateTestTopUp(t, b.Id, 40, PaymentProviderEpay)

			c := registerAffiliateTestUser(t, "aff_c", b.AffCode)
			assert.Equal(t, b.Id, c.InviterId)
			payAffiliateTestTopUp(t, c.Id, 200, PaymentProviderEpay)

			// C's consumption pays B 10% and, because A is a channel, A 5%.
			consumeAffiliateTestQuota(t, c.Id, 100)
			settleAffiliateTestUser(t, c.Id)
			assert.Equal(t, []affiliateTestCredit{
				{b.Id, 1, 10, dollars(10)},
				{a.Id, 2, 5, dollars(5)},
			}, affiliateTestCredits(t, c.Id))

			// Settling again with no new consumption pays nothing.
			settleAffiliateTestUser(t, c.Id)
			assert.Len(t, affiliateTestCredits(t, c.Id), 2)

			// B's own consumption pays A 30%; B paid ¥100, so the base is 50.
			consumeAffiliateTestQuota(t, b.Id, 50)
			settleAffiliateTestUser(t, b.Id)
			assert.Equal(t, []affiliateTestCredit{{a.Id, 1, 30, dollars(15)}}, affiliateTestCredits(t, b.Id))

			// Consumption beyond what C paid earns nothing: ¥200 paid, 250 consumed.
			consumeAffiliateTestQuota(t, c.Id, 150)
			settleAffiliateTestUser(t, c.Id)
			consumeAffiliateTestQuota(t, c.Id, 30)
			settleAffiliateTestUser(t, c.Id)
			assert.Equal(t, []affiliateTestCredit{
				{b.Id, 1, 10, dollars(10)},
				{a.Id, 2, 5, dollars(5)},
				{b.Id, 1, 10, dollars(10)},
				{a.Id, 2, 5, dollars(5)},
			}, affiliateTestCredits(t, c.Id))

			// Users C invites belong to C alone: neither B nor A earns from them.
			_, err = SetAffiliate(c.Id, 10, false, 1)
			require.NoError(t, err)
			d := registerAffiliateTestUser(t, "aff_d", c.AffCode)
			payAffiliateTestTopUp(t, d.Id, 100, PaymentProviderEpay)
			consumeAffiliateTestQuota(t, d.Id, 40)
			settleAffiliateTestUser(t, d.Id)
			assert.Equal(t, []affiliateTestCredit{{c.Id, 1, 10, dollars(4)}}, affiliateTestCredits(t, d.Id))

			assert.Equal(t, dollars(20), affiliateTestBalance(t, b.Id))
			assert.Equal(t, dollars(25), affiliateTestBalance(t, a.Id))

			// Concurrent settlements of the same consumption pay once.
			consumeAffiliateTestQuota(t, d.Id, 10)
			var wg sync.WaitGroup
			for range 8 {
				wg.Go(func() {
					_, err := SettleAffiliateReferral(d.Id)
					assert.NoError(t, err)
				})
			}
			wg.Wait()
			assert.Len(t, affiliateTestCredits(t, d.Id), 2)
			assert.Equal(t, dollars(5), affiliateTestBalance(t, c.Id))

			// With the program off, consumption moves the marks but earns
			// nothing, and turning it back on pays nothing for that period.
			operation_setting.GetAffiliateSetting().Enabled = false
			consumeAffiliateTestQuota(t, d.Id, 20)
			settleAffiliateTestUser(t, d.Id)
			operation_setting.GetAffiliateSetting().Enabled = true
			settleAffiliateTestUser(t, d.Id)
			assert.Len(t, affiliateTestCredits(t, d.Id), 2)

			// A disabled inviter earns nothing.
			require.NoError(t, DB.Model(&User{}).Where("id = ?", c.Id).Update("status", common.UserStatusDisabled).Error)
			consumeAffiliateTestQuota(t, d.Id, 10)
			settleAffiliateTestUser(t, d.Id)
			assert.Len(t, affiliateTestCredits(t, d.Id), 2)
			require.NoError(t, DB.Model(&User{}).Where("id = ?", c.Id).Update("status", common.UserStatusEnabled).Error)

			// An invitee bound while the program was off starts at its
			// consumption and payments of the moment the program finds it.
			operation_setting.GetAffiliateSetting().Enabled = false
			e := registerAffiliateTestUser(t, "aff_e", a.AffCode)
			assert.Equal(t, a.Id, e.InviterId)
			var count int64
			require.NoError(t, DB.Model(&AffiliateReferral{}).Where("user_id = ?", e.Id).Count(&count).Error)
			assert.Zero(t, count)
			payAffiliateTestTopUp(t, e.Id, 50, PaymentProviderEpay)
			consumeAffiliateTestQuota(t, e.Id, 20)
			operation_setting.GetAffiliateSetting().Enabled = true
			started, err := StartMissingAffiliateReferrals(10)
			require.NoError(t, err)
			assert.Equal(t, 1, started)
			started, err = StartMissingAffiliateReferrals(10)
			require.NoError(t, err)
			assert.Zero(t, started)
			consumeAffiliateTestQuota(t, e.Id, 20)
			settleAffiliateTestUser(t, e.Id)
			assert.Empty(t, affiliateTestCredits(t, e.Id), "the ¥50 paid before counting started earns nothing")
			payAffiliateTestTopUp(t, e.Id, 30, PaymentProviderEpay)
			consumeAffiliateTestQuota(t, e.Id, 40)
			settleAffiliateTestUser(t, e.Id)
			assert.Equal(t, []affiliateTestCredit{{a.Id, 1, 30, dollars(9)}}, affiliateTestCredits(t, e.Id))

			// The settlement query finds exactly the invitees whose consumption grew.
			consumeAffiliateTestQuota(t, b.Id, 1)
			ids, _, err := AffiliateReferralsToSettle(0, 10)
			require.NoError(t, err)
			assert.Equal(t, []int{b.Id}, ids)

			// Transfers move commission into the wallet.
			require.NoError(t, TransferAffiliateBalance(b.Id, int(dollars(15))))
			assert.Equal(t, dollars(5), affiliateTestBalance(t, b.Id))
			var wallet User
			require.NoError(t, DB.Select("quota").First(&wallet, b.Id).Error)
			assert.Equal(t, int(dollars(15)), wallet.Quota)
			assert.ErrorIs(t, TransferAffiliateBalance(b.Id, int(dollars(6))), ErrAffiliateBalanceInsufficient)

			// Only channels withdraw; a rejection returns the quota.
			_, err = RequestAffiliateWithdrawal(b.Id, dollars(5), "alipay b")
			assert.ErrorIs(t, err, ErrAffiliateNotChannel)
			_, err = SetAffiliate(a.Id, 30, true, 1)
			require.NoError(t, err)
			require.NoError(t, DB.Model(&Affiliate{}).Where("user_id = ?", a.Id).Update("balance", dollars(250)).Error)
			_, err = RequestAffiliateWithdrawal(a.Id, dollars(99), "alipay a")
			assert.ErrorIs(t, err, ErrAffiliateWithdrawalTooSmall)
			_, err = RequestAffiliateWithdrawal(a.Id, dollars(100), " ")
			assert.ErrorIs(t, err, ErrAffiliateAccountInvalid)
			first, err := RequestAffiliateWithdrawal(a.Id, dollars(100), "alipay a")
			require.NoError(t, err)
			assert.Equal(t, 100.0, first.Money)
			second, err := RequestAffiliateWithdrawal(a.Id, dollars(150), "alipay a")
			require.NoError(t, err)
			assert.Zero(t, affiliateTestBalance(t, a.Id))
			_, err = RequestAffiliateWithdrawal(a.Id, dollars(100), "alipay a")
			assert.ErrorIs(t, err, ErrAffiliateBalanceInsufficient)
			rejected, err := ProcessAffiliateWithdrawal(first.Id, false, 1, "wrong account")
			require.NoError(t, err)
			assert.Equal(t, AffiliateWithdrawalRejected, rejected.Status)
			assert.Equal(t, dollars(100), affiliateTestBalance(t, a.Id))
			paid, err := ProcessAffiliateWithdrawal(second.Id, true, 1, "")
			require.NoError(t, err)
			assert.Equal(t, AffiliateWithdrawalPaid, paid.Status)
			_, err = ProcessAffiliateWithdrawal(first.Id, true, 1, "")
			assert.ErrorIs(t, err, ErrAffiliateWithdrawalProcessed)
			assert.Equal(t, dollars(100), affiliateTestBalance(t, a.Id))
			paidList, total, err := ListAffiliateWithdrawals(0, AffiliateWithdrawalPaid, &common.PageInfo{Page: 1, PageSize: 10})
			require.NoError(t, err)
			assert.EqualValues(t, 1, total)
			assert.Equal(t, "aff_a", paidList[0].Username)

			// An administrator's rate 0 removes invite rights; the default
			// rate does not come back.
			_, err = SetAffiliate(b.Id, 0, false, 1)
			require.NoError(t, err)
			assert.Zero(t, InviterIdForAffCode(b.AffCode))
			require.NoError(t, EnsureDefaultAffiliate(b.Id))
			bAffiliate, err = GetAffiliate(b.Id)
			require.NoError(t, err)
			assert.Zero(t, bAffiliate.Rate)

			// An invite made while the program was off earns the default rate
			// from the inviter's first settlement after it is turned on.
			operation_setting.GetAffiliateSetting().Enabled = false
			x := registerAffiliateTestUser(t, "aff_x", "")
			y := registerAffiliateTestUser(t, "aff_y", x.AffCode)
			assert.Equal(t, x.Id, y.InviterId)
			operation_setting.GetAffiliateSetting().Enabled = true
			backfilled, err := StartMissingAffiliateReferrals(100)
			require.NoError(t, err)
			assert.Positive(t, backfilled)
			payAffiliateTestTopUp(t, y.Id, 50, PaymentProviderEpay)
			consumeAffiliateTestQuota(t, y.Id, 20)
			settleAffiliateTestUser(t, y.Id)
			assert.Equal(t, []affiliateTestCredit{{x.Id, 1, 10, dollars(2)}}, affiliateTestCredits(t, y.Id))

			commissions, total, err := ListAffiliateCommissions(a.Id, &common.PageInfo{Page: 1, PageSize: 2}, true)
			require.NoError(t, err)
			assert.EqualValues(t, 4, total)
			require.Len(t, commissions, 2)
			assert.Equal(t, "af***", commissions[0].SourceName, "an affiliate sees invitees masked")
			commissions, _, err = ListAffiliateCommissions(a.Id, &common.PageInfo{Page: 1, PageSize: 2}, false)
			require.NoError(t, err)
			assert.Equal(t, "aff_e", commissions[0].SourceName, "an administrator sees them whole")
		})
	}
}

func TestAffiliateInviteesDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			useAffiliateTestDB(t, dialect)
			dollars := func(n int) int64 { return int64(n * affiliateDollar) }

			// A is a channel; B, D and E are A's invitees, and C is B's.
			a := registerAffiliateTestUser(t, "aff_a", "")
			_, err := SetAffiliate(a.Id, 30, true, 1)
			require.NoError(t, err)
			b := registerAffiliateTestUser(t, "aff_b", a.AffCode)
			_, err = SetAffiliate(b.Id, 10, false, 1)
			require.NoError(t, err)
			c := registerAffiliateTestUser(t, "aff_c", b.AffCode)
			d := registerAffiliateTestUser(t, "aff_d", a.AffCode)
			e := registerAffiliateTestUser(t, "aff_e", a.AffCode)
			for _, user := range []*User{b, c, d} {
				payAffiliateTestTopUp(t, user.Id, 1000, PaymentProviderEpay)
			}
			// E paid ¥5 and consumed $20, the rest from quota they did not pay for.
			payAffiliateTestTopUp(t, e.Id, 5, PaymentProviderEpay)
			consumeAffiliateTestQuota(t, b.Id, 100)
			consumeAffiliateTestQuota(t, c.Id, 200)
			consumeAffiliateTestQuota(t, d.Id, 7)
			consumeAffiliateTestQuota(t, e.Id, 20)
			for _, user := range []*User{b, c, d, e} {
				settleAffiliateTestUser(t, user.Id)
			}

			invitees, total, err := ListAffiliateInvitees(a.Id, &common.PageInfo{Page: 1, PageSize: 10})
			require.NoError(t, err)
			assert.EqualValues(t, 3, total, "C is B's invitee, not A's")
			require.Len(t, invitees, 3)
			assert.Equal(t, AffiliateInvitee{Id: e.Id, Name: "aff_e", CreatedAt: e.CreatedAt, UsedQuota: dollars(20), CommissionBase: dollars(5), Commission: 750000}, *invitees[0],
				"newest first; only the $5 E paid for earns commission")
			assert.Equal(t, AffiliateInvitee{Id: d.Id, Name: "aff_d", CreatedAt: d.CreatedAt, UsedQuota: dollars(7), CommissionBase: dollars(7), Commission: 1050000}, *invitees[1])
			assert.Equal(t, AffiliateInvitee{Id: b.Id, Name: "aff_b", CreatedAt: b.CreatedAt, UsedQuota: dollars(100), CommissionBase: dollars(100), Commission: dollars(30)}, *invitees[2],
				"A's 5% on C's consumption is second-level and stays off B's row")

			totals, err := SumAffiliateInvitees(a.Id)
			require.NoError(t, err)
			assert.Equal(t, AffiliateInviteeTotals{UsedQuota: dollars(127), CommissionBase: dollars(112), Commission: dollars(30) + 1050000 + 750000}, totals)

			page, total, err := ListAffiliateInvitees(a.Id, &common.PageInfo{Page: 3, PageSize: 1})
			require.NoError(t, err)
			assert.EqualValues(t, 3, total)
			require.Len(t, page, 1)
			assert.Equal(t, dollars(100), page[0].UsedQuota)

			// A user who invited nobody gets an empty page and zero totals.
			invitees, total, err = ListAffiliateInvitees(d.Id, &common.PageInfo{Page: 1, PageSize: 10})
			require.NoError(t, err)
			assert.Zero(t, total)
			assert.Empty(t, invitees)
			totals, err = SumAffiliateInvitees(d.Id)
			require.NoError(t, err)
			assert.Zero(t, totals)
		})
	}
}

func TestAffiliateGiftDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			useAffiliateTestDB(t, dialect)

			// B and E are A's invitees, D is B's, and C signed up without a code.
			a := registerAffiliateTestUser(t, "aff_a", "")
			b := registerAffiliateTestUser(t, "aff_b", a.AffCode)
			c := registerAffiliateTestUser(t, "aff_c", "")
			d := registerAffiliateTestUser(t, "aff_d", b.AffCode)
			e := registerAffiliateTestUser(t, "aff_e", a.AffCode)
			require.NoError(t, DB.Model(&User{}).Where("id = ?", b.Id).Update("email", "b@example.com").Error)

			plan := &SubscriptionPlan{Title: "trial", PriceAmount: 9.9, DurationUnit: SubscriptionDurationDay, DurationValue: 7, Enabled: true}
			require.NoError(t, DB.Create(plan).Error)
			InvalidateSubscriptionPlanCache(plan.Id)
			t.Cleanup(func() { InvalidateSubscriptionPlanCache(plan.Id) })

			_, _, err := GiftAffiliatePlan(a.Id, b.Id)
			assert.ErrorIs(t, err, ErrAffiliateGiftUnavailable, "no gift plan is configured")
			operation_setting.GetAffiliateSetting().GiftPlanId = plan.Id

			// Only a promotion channel with invite rights can gift.
			_, _, err = GiftAffiliatePlan(a.Id, b.Id)
			assert.ErrorIs(t, err, ErrAffiliateGiftUnavailable, "A is an ordinary inviter")
			_, err = SetAffiliate(a.Id, 0, true, 1)
			require.NoError(t, err)
			_, _, err = GiftAffiliatePlan(a.Id, b.Id)
			assert.ErrorIs(t, err, ErrAffiliateGiftUnavailable, "a channel at rate 0 has lost its invite rights")
			_, err = SetAffiliate(a.Id, 10, true, 1)
			require.NoError(t, err)

			_, _, err = GiftAffiliatePlan(a.Id, c.Id)
			assert.ErrorIs(t, err, ErrAffiliateGiftNotInvitee)
			_, _, err = GiftAffiliatePlan(a.Id, d.Id)
			assert.ErrorIs(t, err, ErrAffiliateGiftNotInvitee, "an invitee's invitee is not the caller's")

			gifted, giftedSubscription, err := GiftAffiliatePlan(a.Id, b.Id)
			require.NoError(t, err)
			assert.Equal(t, plan.Id, gifted.Id)
			var subscription UserSubscription
			require.NoError(t, DB.Where("user_id = ? AND plan_id = ?", b.Id, plan.Id).First(&subscription).Error)
			assert.Equal(t, subscription.Id, giftedSubscription.Id)
			assert.Equal(t, subscription.EndTime, giftedSubscription.EndTime)
			assert.Equal(t, SubscriptionSourceAffiliateGift, subscription.Source)
			assert.Equal(t, "active", subscription.Status)
			_, _, err = GiftAffiliatePlan(a.Id, b.Id)
			assert.ErrorIs(t, err, ErrAffiliateGiftTaken, "a plan is gifted once")

			// The gifted invitee cannot buy the plan, by any payment, but an
			// administrator can still bind it.
			assert.ErrorIs(t, CheckSubscriptionPurchase(b.Id, plan), ErrSubscriptionGifted)
			require.NoError(t, DB.Model(&User{}).Where("id = ?", b.Id).Update("quota", 100*affiliateDollar).Error)
			assert.ErrorIs(t, PurchaseSubscriptionWithBalance(b.Id, plan.Id), ErrSubscriptionGifted)
			_, err = AdminBindSubscription(b.Id, plan.Id, "")
			require.NoError(t, err)

			// An invitee who bought the plan cannot be given it.
			require.NoError(t, DB.Model(&User{}).Where("id = ?", e.Id).Update("quota", 100*affiliateDollar).Error)
			require.NoError(t, PurchaseSubscriptionWithBalance(e.Id, plan.Id))
			_, _, err = GiftAffiliatePlan(a.Id, e.Id)
			assert.ErrorIs(t, err, ErrAffiliateGiftTaken)
			assert.NoError(t, CheckSubscriptionPurchase(e.Id, plan), "a purchase does not block buying again")

			invitees, _, err := ListAffiliateInvitees(a.Id, &common.PageInfo{Page: 1, PageSize: 10})
			require.NoError(t, err)
			require.Len(t, invitees, 2)
			assert.Equal(t, "owned", invitees[0].GiftPlan)
			assert.Equal(t, "aff_b", invitees[1].Name)
			assert.Equal(t, "b@example.com", invitees[1].Email)
			assert.Equal(t, "gifted", invitees[1].GiftPlan, "a gift outranks the administrator's later binding")

			// A disabled plan cannot be gifted.
			_, err = SetAffiliate(b.Id, 10, true, 1)
			require.NoError(t, err)
			require.NoError(t, DB.Model(&SubscriptionPlan{}).Where("id = ?", plan.Id).Update("enabled", false).Error)
			InvalidateSubscriptionPlanCache(plan.Id)
			_, _, err = GiftAffiliatePlan(b.Id, d.Id)
			assert.ErrorIs(t, err, ErrAffiliateGiftUnavailable)

			// Once the plan is only for users registered before a cutoff, a
			// later registrant cannot buy it but can still be gifted it, and a
			// newcomer plan takes the opposite side of the same cutoff.
			const cutoff = int64(2_000_000_000)
			require.NoError(t, DB.Model(&User{}).Where("id = ?", c.Id).Update("created_at", cutoff-1).Error)
			require.NoError(t, DB.Model(&User{}).Where("id = ?", d.Id).Update("created_at", cutoff).Error)
			plan.Enabled, plan.RegisteredBefore = true, cutoff
			require.NoError(t, DB.Model(plan).Updates(map[string]any{"enabled": true, "registered_before": cutoff}).Error)
			InvalidateSubscriptionPlanCache(plan.Id)
			assert.NoError(t, CheckSubscriptionPurchase(c.Id, plan))
			assert.ErrorIs(t, CheckSubscriptionPurchase(d.Id, plan), ErrSubscriptionNotEligible)
			_, _, err = GiftAffiliatePlan(b.Id, d.Id)
			require.NoError(t, err, "a gift ignores the registration window")

			newcomer := &SubscriptionPlan{Title: "newcomer", PriceAmount: 29.9, DurationUnit: SubscriptionDurationDay, DurationValue: 7, Enabled: true, RegisteredAfter: cutoff}
			require.NoError(t, DB.Create(newcomer).Error)
			require.NoError(t, DB.Model(&User{}).Where("id = ?", c.Id).Update("quota", 100*affiliateDollar).Error)
			assert.ErrorIs(t, PurchaseSubscriptionWithBalance(c.Id, newcomer.Id), ErrSubscriptionNotEligible)
			assert.NoError(t, CheckSubscriptionPurchase(d.Id, newcomer))
			_, err = AdminBindSubscription(c.Id, newcomer.Id, "")
			require.NoError(t, err, "an administrator can bind it to anyone")
		})
	}
}

func TestSetUserInviterDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			useAffiliateTestDB(t, dialect)
			dollars := func(n int) int64 { return int64(n * affiliateDollar) }

			// B is A's invitee and D is B's; C signed up without a code and
			// has already paid and consumed.
			a := registerAffiliateTestUser(t, "aff_a", "")
			b := registerAffiliateTestUser(t, "aff_b", a.AffCode)
			d := registerAffiliateTestUser(t, "aff_d", b.AffCode)
			c := registerAffiliateTestUser(t, "aff_c", "")
			payAffiliateTestTopUp(t, c.Id, 100, PaymentProviderEpay)
			consumeAffiliateTestQuota(t, c.Id, 50)

			assert.ErrorIs(t, SetUserInviter(c.Id, c.Id), ErrAffiliateInviterInvalid)
			assert.ErrorIs(t, SetUserInviter(c.Id, 1_000_000), ErrAffiliateInviterInvalid)
			assert.ErrorIs(t, SetUserInviter(a.Id, b.Id), ErrAffiliateInviterLoop)
			assert.ErrorIs(t, SetUserInviter(a.Id, d.Id), ErrAffiliateInviterLoop, "D was invited through B")

			require.NoError(t, SetUserInviter(c.Id, a.Id))
			count, err := CountAffiliateInvitees(a.Id)
			require.NoError(t, err)
			assert.EqualValues(t, 2, count)

			// What C paid and consumed before the change earns A nothing; what
			// C pays for and consumes after it does.
			_, err = StartMissingAffiliateReferrals(10)
			require.NoError(t, err)
			consumeAffiliateTestQuota(t, c.Id, 10)
			settleAffiliateTestUser(t, c.Id)
			assert.Empty(t, affiliateTestCredits(t, c.Id))
			payAffiliateTestTopUp(t, c.Id, 100, PaymentProviderEpay)
			consumeAffiliateTestQuota(t, c.Id, 10)
			settleAffiliateTestUser(t, c.Id)
			assert.Equal(t, []affiliateTestCredit{{a.Id, 1, 10, dollars(1)}}, affiliateTestCredits(t, c.Id))

			// Moving C to B sends later commission to B; clearing it sends none.
			require.NoError(t, SetUserInviter(c.Id, b.Id))
			consumeAffiliateTestQuota(t, c.Id, 10)
			settleAffiliateTestUser(t, c.Id)
			require.NoError(t, SetUserInviter(c.Id, 0))
			consumeAffiliateTestQuota(t, c.Id, 10)
			settleAffiliateTestUser(t, c.Id)
			assert.Equal(t, []affiliateTestCredit{{a.Id, 1, 10, dollars(1)}, {b.Id, 1, 10, dollars(1)}}, affiliateTestCredits(t, c.Id))
			var cleared User
			require.NoError(t, DB.Select("inviter_id").Where("id = ?", c.Id).First(&cleared).Error)
			assert.Zero(t, cleared.InviterId)
		})
	}
}
