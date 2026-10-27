package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUsersPaidMoneyDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			db := openTopUpBonusTestDB(t, dialect)
			topUps := []TopUp{
				{UserId: 1, Money: 100, PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess},
				{UserId: 1, Money: 50.5, PaymentProvider: PaymentProviderStripe, Status: common.TopUpStatusSuccess},
				{UserId: 1, Money: 999, PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusPending},
				{UserId: 1, Money: 999, PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusFailed},
				{UserId: 1, Money: 999, PaymentProvider: PaymentProviderBalance, Status: common.TopUpStatusSuccess},
				{UserId: 2, Money: 30, PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess},
				{UserId: 3, Money: 999, PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess},
			}
			for i := range topUps {
				topUps[i].TradeNo = fmt.Sprintf("paid-money-%d", i)
				require.NoError(t, db.Create(&topUps[i]).Error)
			}
			// Orders created before payment_provider existed have it NULL; they count.
			require.NoError(t, db.Model(&TopUp{}).Where("user_id = ?", 2).Update("payment_provider", nil).Error)

			paid, err := UsersPaidMoney([]int{1, 2, 4})
			require.NoError(t, err)
			assert.Equal(t, map[int]float64{1: 150.5, 2: 30}, paid)

			single, err := AffiliatePaidMoney(db, 1)
			require.NoError(t, err)
			assert.Equal(t, paid[1], single)

			empty, err := UsersPaidMoney(nil)
			require.NoError(t, err)
			assert.Empty(t, empty)
		})
	}
}

func TestUsersSortByPaidTotalDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			db := openTopUpBonusTestDB(t, dialect)
			for id := 1; id <= 4; id++ {
				require.NoError(t, db.Create(&User{
					Id: id, Username: fmt.Sprintf("paid%d", id), Password: "password123",
					Status: common.UserStatusEnabled, Group: "default", AffCode: fmt.Sprintf("paid-aff-%d", id),
				}).Error)
			}
			topUps := []TopUp{
				{UserId: 2, Money: 30, PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess},
				{UserId: 2, Money: 40, PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess},
				{UserId: 3, Money: 500, PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusSuccess},
				{UserId: 4, Money: 999, PaymentProvider: PaymentProviderEpay, Status: common.TopUpStatusPending},
				{UserId: 4, Money: 999, PaymentProvider: PaymentProviderBalance, Status: common.TopUpStatusSuccess},
			}
			for i := range topUps {
				topUps[i].TradeNo = fmt.Sprintf("paid-sort-%d", i)
				require.NoError(t, db.Create(&topUps[i]).Error)
			}

			desc, total, err := GetAllUsers(&common.PageInfo{Page: 1, PageSize: 10}, NewUserSortOptions("paid_total", "desc"))
			require.NoError(t, err)
			assert.Equal(t, int64(4), total)
			// Users who paid nothing tie at zero and fall back to newest first.
			assert.Equal(t, []int{3, 2, 4, 1}, collectUserIDs(desc))

			asc, _, err := SearchUsers("paid", "", nil, nil, 0, 10, NewUserSortOptions("paid_total", "asc"))
			require.NoError(t, err)
			assert.Equal(t, []int{4, 1, 2, 3}, collectUserIDs(asc))
		})
	}
}
