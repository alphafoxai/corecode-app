package model

import (
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// Monthly spend bands a team picks when it applies for enterprise pricing.
const (
	EnterpriseSpendUnder1K  = "under_1k"
	EnterpriseSpend1KTo5K   = "1k_5k"
	EnterpriseSpend5KTo20K  = "5k_20k"
	EnterpriseSpend20KTo50K = "20k_50k"
	EnterpriseSpendOver50K  = "over_50k"
)

// EnterpriseSpendBands lists the bands in ascending order.
var EnterpriseSpendBands = []string{
	EnterpriseSpendUnder1K,
	EnterpriseSpend1KTo5K,
	EnterpriseSpend5KTo20K,
	EnterpriseSpend20KTo50K,
	EnterpriseSpendOver50K,
}

// Where an administrator has taken an application.
const (
	EnterpriseStatusPending   = "pending"
	EnterpriseStatusContacted = "contacted"
	EnterpriseStatusWon       = "won"
	EnterpriseStatusRejected  = "rejected"
)

var EnterpriseStatuses = []string{
	EnterpriseStatusPending,
	EnterpriseStatusContacted,
	EnterpriseStatusWon,
	EnterpriseStatusRejected,
}

// EnterpriseMaxPerIPPerHour bounds how many applications one client address
// can file in an hour. The rows are the counter, so a restart or a second
// instance does not reset it.
const EnterpriseMaxPerIPPerHour = 5

// EnterpriseApplication is a team's request for enterprise pricing, filed
// from the public enterprise page with or without an account.
type EnterpriseApplication struct {
	Id           int    `json:"id"`
	Company      string `json:"company" gorm:"type:varchar(128);not null"`
	ContactName  string `json:"contact_name" gorm:"type:varchar(64);not null"`
	Email        string `json:"email" gorm:"type:varchar(254);not null;index"`
	OtherContact string `json:"other_contact" gorm:"type:varchar(128)"`
	MonthlySpend string `json:"monthly_spend" gorm:"type:varchar(16);not null"`
	UseCase      string `json:"use_case" gorm:"type:text"`
	Message      string `json:"message" gorm:"type:text"`
	// UserId is the signed-in submitter, or 0 for a visitor.
	UserId      int    `json:"user_id" gorm:"index"`
	Ip          string `json:"ip" gorm:"type:varchar(64);index"`
	Status      string `json:"status" gorm:"type:varchar(16);not null;index"`
	AdminNote   string `json:"admin_note" gorm:"type:text"`
	CreatedTime int64  `json:"created_time" gorm:"bigint;index"`
	UpdatedTime int64  `json:"updated_time" gorm:"bigint"`
}

// EnterpriseApplicationFilter narrows the administrator's list. Keyword
// matches any part of the company, contact name or email.
type EnterpriseApplicationFilter struct {
	Status  string
	Keyword string
}

func (application *EnterpriseApplication) Insert() error {
	now := common.GetTimestamp()
	application.Status = EnterpriseStatusPending
	application.CreatedTime = now
	application.UpdatedTime = now
	return DB.Create(application).Error
}

// CountEnterpriseApplicationsSince counts the applications filed from ip at
// or after since, a unix second.
func CountEnterpriseApplicationsSince(ip string, since int64) (int64, error) {
	var count int64
	err := DB.Model(&EnterpriseApplication{}).
		Where("ip = ? AND created_time >= ?", ip, since).
		Count(&count).Error
	return count, err
}

// ListEnterpriseApplications pages applications, newest first.
func ListEnterpriseApplications(filter EnterpriseApplicationFilter, pageInfo *common.PageInfo) ([]*EnterpriseApplication, int64, error) {
	query := DB.Model(&EnterpriseApplication{})
	if slices.Contains(EnterpriseStatuses, filter.Status) {
		query = query.Where("status = ?", filter.Status)
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("company LIKE ? OR contact_name LIKE ? OR email LIKE ?", like, like, like)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	applications := make([]*EnterpriseApplication, 0)
	err := query.Order("id DESC").
		Offset(pageInfo.GetStartIdx()).
		Limit(pageInfo.GetPageSize()).
		Find(&applications).Error
	return applications, total, err
}

// UpdateEnterpriseApplication records an administrator's progress on an
// application. It returns gorm.ErrRecordNotFound when id does not exist.
func UpdateEnterpriseApplication(id int, status string, adminNote string) error {
	result := DB.Model(&EnterpriseApplication{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"status":       status,
			"admin_note":   adminNote,
			"updated_time": common.GetTimestamp(),
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
