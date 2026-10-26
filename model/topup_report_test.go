package model

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTopUpReportDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			useAffiliateTestDB(t, dialect)
			alice := registerAffiliateTestUser(t, "alice", "")
			bob := registerAffiliateTestUser(t, "42", "")

			// Day boundaries are at UTC+8 midnight: 2025-10-01 00:00 +08:00.
			const offset = 8 * 3600
			const day1 = int64(1759248000)
			topUps := []TopUp{
				{UserId: alice.Id, Money: 10.1, PaymentMethod: "alipay", Status: common.TopUpStatusSuccess, TradeNo: "ORD_a1", CreateTime: day1 + 60},
				{UserId: alice.Id, Money: 20.2, PaymentMethod: "stripe", Status: common.TopUpStatusSuccess, TradeNo: "ORD_a2", CreateTime: day1 + 86400 - 1},
				{UserId: bob.Id, Money: 30, PaymentMethod: "alipay", Status: common.TopUpStatusSuccess, TradeNo: "ORD%b1", CreateTime: day1 + 2*86400},
				{UserId: bob.Id, Money: 99, PaymentMethod: "alipay", Status: common.TopUpStatusPending, TradeNo: "ORD_b2", CreateTime: day1 + 2*86400},
				{UserId: bob.Id, Money: 500, PaymentMethod: "balance", PaymentProvider: PaymentProviderBalance, Status: common.TopUpStatusSuccess, TradeNo: "SUB_b3", CreateTime: day1 + 2*86400},
				{UserId: alice.Id, Money: 7, PaymentMethod: "alipay", Status: common.TopUpStatusSuccess, TradeNo: "ORD_a4", CreateTime: day1 + 3*86400},
			}
			require.NoError(t, DB.Create(&topUps).Error)
			window := TopUpFilter{StartTime: day1, EndTime: day1 + 3*86400}

			stats, err := GetTopUpStats(window, offset)
			require.NoError(t, err)
			assert.Equal(t, 60.3, stats.Money, "pending, wallet-paid and out-of-range orders are left out")
			assert.EqualValues(t, 3, stats.Count)
			assert.EqualValues(t, 2, stats.UserCount)
			assert.Equal(t, []TopUpDay{
				{Day: day1, Money: 30.3, Count: 2},
				{Day: day1 + 86400},
				{Day: day1 + 2*86400, Money: 30, Count: 1},
			}, stats.Daily, "a day with no top-ups is still a bar")
			assert.Equal(t, []TopUpMethodTotal{{"alipay", 40.1, 2}, {"stripe", 20.2, 1}}, stats.Methods)
			assert.Equal(t, []string{"alipay", "balance", "stripe"}, stats.PaymentMethods)

			// Bucketing at UTC instead moves alice's late order to the next day.
			stats, err = GetTopUpStats(window, 0)
			require.NoError(t, err)
			require.Len(t, stats.Daily, 4)
			assert.Equal(t, TopUpDay{Day: day1 + offset, Money: 20.2, Count: 1}, stats.Daily[1])

			list := func(filter TopUpFilter) []string {
				t.Helper()
				records, total, err := ListTopUpRecords(filter, &common.PageInfo{Page: 1, PageSize: 10})
				require.NoError(t, err)
				tradeNos := make([]string, 0, len(records))
				for _, record := range records {
					tradeNos = append(tradeNos, record.TradeNo)
				}
				assert.EqualValues(t, len(records), total)
				return tradeNos
			}
			assert.Equal(t, []string{"SUB_b3", "ORD_b2", "ORD%b1", "ORD_a2", "ORD_a1"}, list(window), "newest first, any status")
			assert.Equal(t, []string{"ORD_b2"}, list(TopUpFilter{Status: common.TopUpStatusPending}))
			assert.Equal(t, []string{"ORD_a4", "ORD_a2", "ORD_a1"}, list(TopUpFilter{User: "alice"}))
			assert.Equal(t, []string{"SUB_b3", "ORD_b2", "ORD%b1"}, list(TopUpFilter{User: "42"}), "a numeric name matches the username too")
			assert.Equal(t, []string{"ORD_a4", "ORD_a2", "ORD_a1"}, list(TopUpFilter{User: strconv.Itoa(alice.Id)}))
			assert.Equal(t, []string{"ORD%b1"}, list(TopUpFilter{TradeNo: "%b"}), "wildcards in the order number are literal")
			assert.Equal(t, []string{"ORD_a2"}, list(TopUpFilter{PaymentMethod: "stripe"}))

			records, _, err := ListTopUpRecords(TopUpFilter{TradeNo: "a1"}, &common.PageInfo{Page: 1, PageSize: 10})
			require.NoError(t, err)
			require.Len(t, records, 1)
			assert.Equal(t, "alice", records[0].Username)
		})
	}
}
