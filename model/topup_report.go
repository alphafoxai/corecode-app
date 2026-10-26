package model

import (
	"cmp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// TopUpReportMaxDays bounds the range of TopUpStats, which reads every
// matching row to bucket it by day.
const TopUpReportMaxDays = 366

// TopUpFilter narrows the administrator's top-up report. StartTime and
// EndTime are unix seconds on create_time, end exclusive; zero leaves that
// side open. User is a user id or an exact username, and TradeNo matches
// any part of the order number.
type TopUpFilter struct {
	StartTime     int64
	EndTime       int64
	User          string
	TradeNo       string
	Status        string
	PaymentMethod string
}

// TopUpRecord is a top-up row with its owner's name for the report.
type TopUpRecord struct {
	*TopUp
	Username string `json:"username"`
}

// TopUpDay is the successful top-ups of one day. Day is the unix second the
// day starts at in the caller's time zone.
type TopUpDay struct {
	Day   int64   `json:"day"`
	Money float64 `json:"money"`
	Count int64   `json:"count"`
}

// TopUpMethodTotal is the successful top-ups through one payment method.
type TopUpMethodTotal struct {
	PaymentMethod string  `json:"payment_method"`
	Money         float64 `json:"money"`
	Count         int64   `json:"count"`
}

// TopUpStats summarizes successful top-ups paid through a gateway. Orders
// paid from the wallet are excluded, because that money was counted when
// the wallet was topped up. PaymentMethods lists every method ever used, for
// the report's filter.
type TopUpStats struct {
	Money          float64            `json:"money"`
	Count          int64              `json:"count"`
	UserCount      int64              `json:"user_count"`
	Daily          []TopUpDay         `json:"daily"`
	Methods        []TopUpMethodTotal `json:"methods"`
	PaymentMethods []string           `json:"payment_methods"`
}

func (filter TopUpFilter) apply(query *gorm.DB) *gorm.DB {
	if filter.StartTime > 0 {
		query = query.Where("create_time >= ?", filter.StartTime)
	}
	if filter.EndTime > 0 {
		query = query.Where("create_time < ?", filter.EndTime)
	}
	if user := strings.TrimSpace(filter.User); user != "" {
		byName := DB.Model(&User{}).Unscoped().Select("id").Where("username = ?", user)
		if id, err := strconv.Atoi(user); err == nil {
			query = query.Where("user_id = ? OR user_id IN (?)", id, byName)
		} else {
			query = query.Where("user_id IN (?)", byName)
		}
	}
	if tradeNo := strings.TrimSpace(filter.TradeNo); tradeNo != "" {
		escaped := strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(tradeNo)
		query = query.Where("trade_no LIKE ? ESCAPE '!'", "%"+escaped+"%")
	}
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.PaymentMethod != "" {
		query = query.Where("payment_method = ?", filter.PaymentMethod)
	}
	return query
}

// ListTopUpRecords pages the top-ups matching filter, newest first.
func ListTopUpRecords(filter TopUpFilter, pageInfo *common.PageInfo) ([]TopUpRecord, int64, error) {
	var total int64
	if err := filter.apply(DB.Model(&TopUp{})).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var topUps []*TopUp
	if err := filter.apply(DB.Model(&TopUp{})).Order("id desc").
		Offset(pageInfo.GetStartIdx()).Limit(pageInfo.GetPageSize()).Find(&topUps).Error; err != nil {
		return nil, 0, err
	}
	ids := make([]int, 0, len(topUps))
	for _, topUp := range topUps {
		ids = append(ids, topUp.UserId)
	}
	names, err := affiliateUsernames(ids)
	if err != nil {
		return nil, 0, err
	}
	records := make([]TopUpRecord, 0, len(topUps))
	for _, topUp := range topUps {
		records = append(records, TopUpRecord{TopUp: topUp, Username: names[topUp.UserId]})
	}
	return records, total, nil
}

// GetTopUpStats sums successful gateway top-ups in [StartTime, EndTime),
// bucketed by day at offset seconds east of UTC. Status and TradeNo in the
// filter are ignored: the summary is always of successful payments.
func GetTopUpStats(filter TopUpFilter, offset int64) (*TopUpStats, error) {
	filter.Status, filter.TradeNo = "", ""
	var rows []struct {
		UserId        int
		Money         float64
		PaymentMethod string
		CreateTime    int64
	}
	err := filter.apply(DB.Model(&TopUp{})).
		Select("user_id, money, payment_method, create_time").
		Where("status = ? AND (payment_provider IS NULL OR payment_provider <> ?)", common.TopUpStatusSuccess, PaymentProviderBalance).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}

	dayStart := func(at int64) int64 {
		local := at + offset
		return local - ((local%86400)+86400)%86400 - offset
	}
	type bucket struct {
		money decimal.Decimal
		count int64
	}
	days := make(map[int64]*bucket)
	// The offset is fixed for the whole range, so every day is 86400 seconds.
	for day := dayStart(filter.StartTime); day < filter.EndTime; day += 86400 {
		days[day] = &bucket{}
	}
	methods := make(map[string]*bucket)
	users := make(map[int]struct{})
	total := decimal.Zero
	for _, row := range rows {
		money := decimal.NewFromFloat(row.Money)
		total = total.Add(money)
		users[row.UserId] = struct{}{}
		day := days[dayStart(row.CreateTime)]
		day.money, day.count = day.money.Add(money), day.count+1
		method := methods[row.PaymentMethod]
		if method == nil {
			method = &bucket{}
			methods[row.PaymentMethod] = method
		}
		method.money, method.count = method.money.Add(money), method.count+1
	}

	stats := &TopUpStats{
		Money:     total.Round(2).InexactFloat64(),
		Count:     int64(len(rows)),
		UserCount: int64(len(users)),
		Daily:     make([]TopUpDay, 0, len(days)),
		Methods:   make([]TopUpMethodTotal, 0, len(methods)),
	}
	for day, value := range days {
		stats.Daily = append(stats.Daily, TopUpDay{Day: day, Money: value.money.Round(2).InexactFloat64(), Count: value.count})
	}
	slices.SortFunc(stats.Daily, func(a, b TopUpDay) int { return cmp.Compare(a.Day, b.Day) })
	for method, value := range methods {
		stats.Methods = append(stats.Methods, TopUpMethodTotal{PaymentMethod: method, Money: value.money.Round(2).InexactFloat64(), Count: value.count})
	}
	slices.SortFunc(stats.Methods, func(a, b TopUpMethodTotal) int { return cmp.Compare(b.Money, a.Money) })
	if err := DB.Model(&TopUp{}).Where("payment_method <> ''").Distinct("payment_method").
		Order("payment_method").Pluck("payment_method", &stats.PaymentMethods).Error; err != nil {
		return nil, err
	}
	return stats, nil
}

// TopUpReportRange resolves the stats range: end defaults to now, start to
// thirty days before end, and the span may not exceed TopUpReportMaxDays.
func TopUpReportRange(start int64, end int64) (int64, int64, bool) {
	if end <= 0 {
		end = time.Now().Unix()
	}
	if start <= 0 {
		start = end - 30*86400
	}
	return start, end, start < end && end-start <= TopUpReportMaxDays*86400
}
