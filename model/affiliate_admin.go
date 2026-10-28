package model

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrAffiliateCodeInvalid     error = common.NewMessage("An invite code is 3 to 32 letters, digits, hyphens or underscores")
	ErrAffiliateCodeTaken       error = common.NewMessage("This invite code is already in use")
	ErrAffiliateCodeReserved    error = common.NewMessage("This invite code is reserved")
	ErrAffiliateCodeUnavailable error = common.NewMessage("Invitations are not available for your account.")
	ErrAffiliateCodeChangeLimit error = common.NewMessage("You have changed your invite code too many times")
)

// affiliateSelfCodeChanges is how many codes a user may give up by choosing
// their own. Each one stays theirs, so the cap stops one account from
// holding codes it no longer uses.
const affiliateSelfCodeChanges = 5

// AffiliateRetiredCode is a code a user gave up. Links carrying it no longer
// bind, but no other account may take it, or it would capture the sign-ups
// those links still bring. Code is lowercase.
type AffiliateRetiredCode struct {
	Id        int    `json:"id"`
	Code      string `json:"code" gorm:"type:varchar(32);uniqueIndex"`
	UserId    int    `json:"user_id" gorm:"index"`
	CreatedAt int64  `json:"created_at" gorm:"autoCreateTime"`
}

// affiliateCodePattern is what an administrator may give a user as their
// invite code: short enough for the aff_code column and safe in a URL.
var affiliateCodePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{3,32}$`)

// AffiliateListItem is one user on the administrators' invitation page: an
// affiliate, or a user who invited someone before they had an affiliate row.
// Rate, Channel, Tier, Balance and Earned are zero when HasAffiliate is false.
type AffiliateListItem struct {
	UserId       int    `json:"user_id"`
	Username     string `json:"username"`
	DisplayName  string `json:"display_name"`
	Email        string `json:"email"`
	Status       int    `json:"status"`
	AffCode      string `json:"aff_code"`
	HasAffiliate bool   `json:"has_affiliate"`
	Rate         int    `json:"rate"`
	Channel      bool   `json:"channel"`
	Tier         string `json:"tier"`
	InviteeCount int64  `json:"invitee_count"`
	Balance      int64  `json:"balance"`
	Earned       int64  `json:"earned"`
}

// AffiliateListFilter narrows ListAffiliates. Type is "" for every listed
// user, "channel" for promotion channels of either tier, "retail" or
// "distributor" for one tier, "inviting" for users with at
// least one invitee and "revoked" for users an administrator set to rate 0.
// Sort is "invitees" (the default), "earned" or "recent".
type AffiliateListFilter struct {
	Keyword string
	Type    string
	Sort    string
}

// ListAffiliates pages the users who can invite or have invited someone,
// with their terms, invitee count and commission.
func ListAffiliates(filter AffiliateListFilter, pageInfo *common.PageInfo) ([]*AffiliateListItem, int64, error) {
	invitees := DB.Model(&User{}).Select("inviter_id, COUNT(*) AS invitee_count").
		Where("inviter_id > 0").Group("inviter_id")
	query := DB.Table("users").
		Joins("LEFT JOIN affiliates ON affiliates.user_id = users.id").
		Joins("LEFT JOIN (?) AS invitees ON invitees.inviter_id = users.id", invitees).
		Where("users.deleted_at IS NULL")
	switch filter.Type {
	case "channel":
		query = query.Where("affiliates.channel = ?", true)
	case AffiliateTierRetail, AffiliateTierDistributor:
		query = query.Where("affiliates.tier = ?", filter.Type)
	case "inviting":
		query = query.Where("invitees.invitee_count > 0")
	case "revoked":
		query = query.Where("affiliates.rate = 0")
	default:
		query = query.Where("affiliates.id IS NOT NULL OR invitees.invitee_count > 0")
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		condition := "users.username LIKE ? OR LOWER(users.email) LIKE ? OR users.display_name LIKE ? OR users.aff_code = ?"
		args := []any{like, "%" + strings.ToLower(keyword) + "%", like, keyword}
		if id, err := strconv.Atoi(keyword); err == nil {
			condition = "users.id = ? OR " + condition
			args = append([]any{id}, args...)
		}
		query = query.Where("("+condition+")", args...)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	switch filter.Sort {
	case "earned":
		query = query.Order("COALESCE(affiliates.earned, 0) DESC")
	case "recent":
	default:
		query = query.Order("COALESCE(invitees.invitee_count, 0) DESC")
	}
	// The joined columns are NULL for a user without an affiliate row or
	// invitees, so they scan into pointers.
	var rows []struct {
		UserId       int
		Username     string
		DisplayName  string
		Email        string
		Status       int
		AffCode      string
		AffiliateId  *int
		Rate         *int
		Channel      *bool
		Tier         *string
		InviteeCount *int64
		Balance      *int64
		Earned       *int64
	}
	if err := query.Select("users.id AS user_id, users.username, users.display_name, users.email, users.status, users.aff_code, " +
		"affiliates.id AS affiliate_id, affiliates.rate, affiliates.channel, affiliates.tier, affiliates.balance, affiliates.earned, invitees.invitee_count").
		Order("users.id DESC").Offset(pageInfo.GetStartIdx()).Limit(pageInfo.GetPageSize()).Scan(&rows).Error; err != nil {
		return nil, 0, err
	}
	items := make([]*AffiliateListItem, 0, len(rows))
	for _, row := range rows {
		item := &AffiliateListItem{
			UserId:       row.UserId,
			Username:     row.Username,
			DisplayName:  row.DisplayName,
			Email:        row.Email,
			Status:       row.Status,
			AffCode:      row.AffCode,
			HasAffiliate: row.AffiliateId != nil,
		}
		if row.Rate != nil {
			item.Rate = *row.Rate
		}
		if row.Channel != nil {
			item.Channel = *row.Channel
		}
		if row.Tier != nil {
			item.Tier = *row.Tier
		}
		if row.InviteeCount != nil {
			item.InviteeCount = *row.InviteeCount
		}
		if row.Balance != nil {
			item.Balance = *row.Balance
		}
		if row.Earned != nil {
			item.Earned = *row.Earned
		}
		items = append(items, item)
	}
	return items, total, nil
}

// AffiliateOverview sums the invitation program over every user. Inviters
// counts users with at least one invitee; amounts are quota units.
// SignupGifts and SignupGiftsWithheld count sign-up gifts given and withheld
// by a limit in the last 24 hours.
type AffiliateOverview struct {
	Inviters               int64 `json:"inviters"`
	Channels               int64 `json:"channels"`
	Invitees               int64 `json:"invitees"`
	Earned                 int64 `json:"earned"`
	Balance                int64 `json:"balance"`
	PendingWithdrawals     int64 `json:"pending_withdrawals"`
	PendingWithdrawalQuota int64 `json:"pending_withdrawal_quota"`
	SignupGifts            int64 `json:"signup_gifts"`
	SignupGiftsWithheld    int64 `json:"signup_gifts_withheld"`
}

func GetAffiliateOverview() (*AffiliateOverview, error) {
	var overview AffiliateOverview
	if err := DB.Model(&User{}).Where("inviter_id > 0").
		Select("COUNT(*)").Scan(&overview.Invitees).Error; err != nil {
		return nil, err
	}
	if err := DB.Model(&User{}).Where("inviter_id > 0").
		Select("COUNT(DISTINCT inviter_id)").Scan(&overview.Inviters).Error; err != nil {
		return nil, err
	}
	var commission struct {
		Channels int64
		Earned   int64
		Balance  int64
	}
	if err := DB.Model(&Affiliate{}).
		Select("COALESCE(SUM(CASE WHEN channel = ? THEN 1 ELSE 0 END), 0) AS channels, COALESCE(SUM(earned), 0) AS earned, COALESCE(SUM(balance), 0) AS balance", true).
		Scan(&commission).Error; err != nil {
		return nil, err
	}
	overview.Channels, overview.Earned, overview.Balance = commission.Channels, commission.Earned, commission.Balance
	var pending struct {
		Count int64
		Quota int64
	}
	if err := DB.Model(&AffiliateWithdrawal{}).Where("status = ?", AffiliateWithdrawalPending).
		Select("COUNT(*) AS count, COALESCE(SUM(quota), 0) AS quota").Scan(&pending).Error; err != nil {
		return nil, err
	}
	overview.PendingWithdrawals, overview.PendingWithdrawalQuota = pending.Count, pending.Quota
	var gifts struct {
		Given    int64
		Withheld int64
	}
	if err := DB.Model(&AffiliateSignupGift{}).Where("created_at >= ?", common.GetTimestamp()-affiliateSignupGiftWindow).
		Select("COALESCE(SUM(CASE WHEN status = ? THEN 1 ELSE 0 END), 0) AS given, COALESCE(SUM(CASE WHEN status <> ? THEN 1 ELSE 0 END), 0) AS withheld",
			AffiliateSignupGiftGiven, AffiliateSignupGiftGiven).
		Scan(&gifts).Error; err != nil {
		return nil, err
	}
	overview.SignupGifts, overview.SignupGiftsWithheld = gifts.Given, gifts.Withheld
	return &overview, nil
}

// SetUserAffCode gives a user an invite code an administrator chose, so a
// promotion link reads as the channel's name. Reserved words are allowed.
func SetUserAffCode(userId int, code string) (string, error) {
	return setAffCode(userId, code, false)
}

// SetSelfAffCode gives a user the invite code they chose themselves. Unlike
// root, they cannot choose a reserved code, and can give up only
// affiliateSelfCodeChanges codes.
func SetSelfAffCode(userId int, code string) (string, error) {
	return setAffCode(userId, code, true)
}

// setAffCode replaces a user's invite code. The old code stops binding at
// once and is retired to the user. Codes are compared without case, because
// MySQL's unique index and lookups ignore it while PostgreSQL's and SQLite's
// do not; a deleted user's code stays taken, as the unique index still holds
// it.
func setAffCode(userId int, code string, self bool) (string, error) {
	code = strings.TrimSpace(code)
	if !affiliateCodePattern.MatchString(code) {
		return "", ErrAffiliateCodeInvalid
	}
	if self && operation_setting.GetAffiliateSetting().CodeReserved(code) {
		return "", ErrAffiliateCodeReserved
	}
	lower := strings.ToLower(code)
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id", "aff_code").Where("id = ?", userId).First(&user).Error; err != nil {
			return err
		}
		if user.AffCode == code {
			return nil
		}
		var taken int64
		if err := tx.Unscoped().Model(&User{}).Where("LOWER(aff_code) = ? AND id <> ?", lower, userId).
			Count(&taken).Error; err != nil {
			return err
		}
		if taken == 0 {
			if err := tx.Model(&AffiliateRetiredCode{}).Where("code = ? AND user_id <> ?", lower, userId).
				Count(&taken).Error; err != nil {
				return err
			}
		}
		if taken > 0 {
			return ErrAffiliateCodeTaken
		}
		if self && !strings.EqualFold(user.AffCode, code) {
			var retired int64
			if err := tx.Model(&AffiliateRetiredCode{}).Where("user_id = ?", userId).Count(&retired).Error; err != nil {
				return err
			}
			if retired >= affiliateSelfCodeChanges {
				return ErrAffiliateCodeChangeLimit
			}
		}
		if err := tx.Model(&User{}).Where("id = ?", userId).Update("aff_code", code).Error; err != nil {
			return err
		}
		if user.AffCode == "" || strings.EqualFold(user.AffCode, code) {
			return nil
		}
		return tx.Clauses(clause.OnConflict{DoNothing: true}).
			Create(&AffiliateRetiredCode{Code: strings.ToLower(user.AffCode), UserId: userId}).Error
	})
	if err != nil {
		return "", err
	}
	return code, nil
}
