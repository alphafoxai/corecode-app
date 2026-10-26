package model

import (
	"cmp"
	"slices"

	"github.com/QuantumNous/new-api/common"

	"github.com/shopspring/decimal"
)

// FinanceDay is one day of revenue and list-price consumption.
type FinanceDay struct {
	Day            int64   `json:"day"`
	Topup          float64 `json:"topup"`
	Subscription   float64 `json:"subscription"`
	ConsumptionUSD float64 `json:"consumption_usd"`
}

// BalanceUser is a wallet balance in USD.
type BalanceUser struct {
	UserRef
	BalanceUSD float64 `json:"balance_usd"`
}

// QuotaAdjustment is one manual balance change an administrator made, read
// from the audit log.
type QuotaAdjustment struct {
	CreatedAt   int64   `json:"created_at"`
	Operator    string  `json:"operator"`
	Target      UserRef `json:"target"`
	Mode        string  `json:"mode"`
	RequestUSD  float64 `json:"request_usd"`
	BeforeUSD   float64 `json:"before_usd"`
	AfterUSD    float64 `json:"after_usd"`
	DeltaUSD    float64 `json:"delta_usd"`
	Success     bool    `json:"success"`
	HasSnapshot bool    `json:"has_snapshot"`
}

// FinanceInsights compares the money taken in a range with what customers
// consumed at list price, and states the balances the site still owes.
// Revenue is in the payment currency; consumption and balances are USD.
type FinanceInsights struct {
	Revenue             float64            `json:"revenue"`
	TopupRevenue        float64            `json:"topup_revenue"`
	SubscriptionRevenue float64            `json:"subscription_revenue"`
	Orders              int64              `json:"orders"`
	PayingUsers         int64              `json:"paying_users"`
	Methods             []TopUpMethodTotal `json:"methods"`
	Daily               []FinanceDay       `json:"daily"`
	ConsumptionUSD      float64            `json:"consumption_usd"`
	// RevenuePerUSD is revenue divided by list-price consumption: what one
	// dollar of consumption brought in over the range.
	RevenuePerUSD       float64           `json:"revenue_per_usd"`
	LiabilityUSD        float64           `json:"liability_usd"`
	LiabilityUsers      int64             `json:"liability_users"`
	DebtUSD             float64           `json:"debt_usd"`
	Debtors             []BalanceUser     `json:"debtors"`
	TopBalances         []BalanceUser     `json:"top_balances"`
	Adjustments         []QuotaAdjustment `json:"adjustments"`
	AdjustmentNetUSD    float64           `json:"adjustment_net_usd"`
	CommissionUSD       float64           `json:"commission_usd"`
	RedemptionUSD       float64           `json:"redemption_usd"`
	BonusUSD            float64           `json:"bonus_usd"`
	TopupCreditUSD      float64           `json:"topup_credit_usd"`
	AdjustmentLogsFound bool              `json:"adjustment_logs_found"`
}

func GetFinanceInsights(r InsightsRange) (*FinanceInsights, error) {
	orders, err := readPaidOrders(r.Start, r.End)
	if err != nil {
		return nil, err
	}
	result := &FinanceInsights{}
	days := make(map[int64]*FinanceDay)
	for _, day := range r.days() {
		days[day] = &FinanceDay{Day: day}
	}
	type money struct {
		total decimal.Decimal
		count int64
	}
	methods := make(map[string]*money)
	payers := make(map[int]struct{})
	topup, subscription := decimal.Zero, decimal.Zero
	var credit, bonus int64
	for _, order := range orders {
		amount := decimal.NewFromFloat(order.Money)
		day := days[r.DayStart(order.CreateTime)]
		if order.Subscription {
			subscription = subscription.Add(amount)
			if day != nil {
				day.Subscription += order.Money
			}
		} else {
			topup = topup.Add(amount)
			credit += order.Amount
			if day != nil {
				day.Topup += order.Money
			}
		}
		payers[order.UserId] = struct{}{}
		method := methods[order.PaymentMethod]
		if method == nil {
			method = &money{}
			methods[order.PaymentMethod] = method
		}
		method.total, method.count = method.total.Add(amount), method.count+1
	}
	var bonusQuota []int64
	if err := DB.Model(&TopUp{}).Where("status = ? AND create_time >= ? AND create_time < ?", common.TopUpStatusSuccess, r.Start, r.End).
		Pluck("bonus_quota", &bonusQuota).Error; err != nil {
		return nil, err
	}
	for _, quota := range bonusQuota {
		bonus += quota
	}
	result.TopupRevenue = topup.Round(2).InexactFloat64()
	result.SubscriptionRevenue = subscription.Round(2).InexactFloat64()
	result.Revenue = topup.Add(subscription).Round(2).InexactFloat64()
	result.Orders = int64(len(orders))
	result.PayingUsers = int64(len(payers))
	// A top-up's amount is in display units of one dollar.
	result.TopupCreditUSD = float64(credit)
	result.BonusUSD = quotaUSD(bonus)
	for method, value := range methods {
		result.Methods = append(result.Methods, TopUpMethodTotal{PaymentMethod: method, Money: value.total.Round(2).InexactFloat64(), Count: value.count})
	}
	slices.SortFunc(result.Methods, func(a, b TopUpMethodTotal) int { return cmp.Compare(b.Money, a.Money) })

	quota, err := readInsightQuota(r.Start, r.End)
	if err != nil {
		return nil, err
	}
	var consumed int64
	for _, row := range quota {
		consumed += int64(row.Quota)
		if day := days[r.DayStart(row.CreatedAt)]; day != nil {
			day.ConsumptionUSD += float64(row.Quota) / common.QuotaPerUnit
		}
	}
	result.ConsumptionUSD = quotaUSD(consumed)
	result.RevenuePerUSD = ratio(result.Revenue, result.ConsumptionUSD)
	for _, day := range days {
		day.Topup, day.Subscription, day.ConsumptionUSD = roundTo(day.Topup, 2), roundTo(day.Subscription, 2), roundTo(day.ConsumptionUSD, 4)
		result.Daily = append(result.Daily, *day)
	}
	slices.SortFunc(result.Daily, func(a, b FinanceDay) int { return cmp.Compare(a.Day, b.Day) })

	if err := fillBalances(result); err != nil {
		return nil, err
	}
	if err := fillQuotaAdjustments(r, result); err != nil {
		return nil, err
	}
	var commission, redemption struct{ Total int64 }
	if err := DB.Model(&AffiliateCommission{}).Select("COALESCE(SUM(amount), 0) AS total").
		Where("created_at >= ? AND created_at < ?", r.Start, r.End).Scan(&commission).Error; err != nil {
		return nil, err
	}
	if err := DB.Model(&Redemption{}).Select("COALESCE(SUM(quota), 0) AS total").
		Where("redeemed_time >= ? AND redeemed_time < ?", r.Start, r.End).Scan(&redemption).Error; err != nil {
		return nil, err
	}
	result.CommissionUSD = quotaUSD(commission.Total)
	result.RedemptionUSD = quotaUSD(redemption.Total)
	return result, nil
}

// fillBalances states the current balances of every customer. The root
// account is left out: its balance is the operator's, not money owed.
func fillBalances(result *FinanceInsights) error {
	var users []struct {
		Id       int
		Username string
		Quota    int64
	}
	if err := DB.Model(&User{}).Select("id, username, quota").Where("role < ?", common.RoleRootUser).Find(&users).Error; err != nil {
		return err
	}
	var liability, debt int64
	balances := make([]BalanceUser, 0, len(users))
	for _, user := range users {
		balance := BalanceUser{UserRef: UserRef{UserID: user.Id, Username: user.Username}, BalanceUSD: quotaUSD(user.Quota)}
		switch {
		case user.Quota > 0:
			liability += user.Quota
			result.LiabilityUsers++
			balances = append(balances, balance)
		case user.Quota < 0:
			debt += user.Quota
			result.Debtors = append(result.Debtors, balance)
		}
	}
	result.LiabilityUSD = quotaUSD(liability)
	result.DebtUSD = quotaUSD(debt)
	slices.SortFunc(balances, func(a, b BalanceUser) int { return cmp.Compare(b.BalanceUSD, a.BalanceUSD) })
	result.TopBalances = balances[:min(len(balances), insightsTopN)]
	slices.SortFunc(result.Debtors, func(a, b BalanceUser) int { return cmp.Compare(a.BalanceUSD, b.BalanceUSD) })
	if result.Debtors == nil {
		result.Debtors = []BalanceUser{}
	}
	return nil
}

func auditInt(fields AuditFields, key string) (int64, bool) {
	raw, ok := fields[key]
	if !ok {
		return 0, false
	}
	var value int64
	switch typed := raw.(type) {
	case []byte:
		if err := common.Unmarshal(typed, &value); err != nil {
			return 0, false
		}
	default:
		encoded, err := common.Marshal(typed)
		if err != nil || common.Unmarshal(encoded, &value) != nil {
			return 0, false
		}
	}
	return value, true
}

func auditString(fields AuditFields, key string) string {
	raw, ok := fields[key]
	if !ok {
		return ""
	}
	encoded, err := common.Marshal(raw)
	if err != nil {
		return ""
	}
	var value string
	if common.Unmarshal(encoded, &value) != nil {
		return ""
	}
	return value
}

func fillQuotaAdjustments(r InsightsRange, result *FinanceInsights) error {
	var logs []AuditLog
	err := LOG_DB.Model(&AuditLog{}).
		Where("created_at >= ? AND created_at < ? AND action IN ?", r.Start, r.End,
			[]string{"user.quota_add", "user.quota_subtract", "user.quota_override"}).
		Order("id desc").Limit(500).Find(&logs).Error
	if err != nil {
		return err
	}
	result.AdjustmentLogsFound = len(logs) > 0
	result.Adjustments = make([]QuotaAdjustment, 0, len(logs))
	var net int64
	for _, log := range logs {
		adjustment := QuotaAdjustment{CreatedAt: log.CreatedAt, Operator: log.Username, Success: log.Success}
		if log.Other.Op != nil {
			params := log.Other.Op.Params
			target, _ := auditInt(params, "target_user_id")
			adjustment.Target = UserRef{UserID: int(target), Username: auditString(params, "target_username")}
			adjustment.Mode = auditString(params, "mode")
			requested, _ := auditInt(params, "requested_quota")
			adjustment.RequestUSD = quotaUSD(requested)
			before, hasBefore := auditInt(params, "from")
			after, hasAfter := auditInt(params, "to")
			if hasBefore && hasAfter {
				adjustment.HasSnapshot = true
				adjustment.BeforeUSD, adjustment.AfterUSD = quotaUSD(before), quotaUSD(after)
				adjustment.DeltaUSD = quotaUSD(after - before)
				if log.Success {
					net += after - before
				}
			}
		}
		result.Adjustments = append(result.Adjustments, adjustment)
	}
	result.AdjustmentNetUSD = quotaUSD(net)
	return nil
}
