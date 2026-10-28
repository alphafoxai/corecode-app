package operation_setting

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// AffiliateSetting runs the invite commission program. An affiliate earns
// their own rate on what the users they invited paid for and then consumed;
// a distributor channel also earns SecondLevelRate on the users its invitees
// invite. Rates are whole percents; money amounts are in the payment
// currency.
type AffiliateSetting struct {
	Enabled bool `json:"enabled"`
	// SelfServeRate is the default rate every user has while the program is
	// on, unless an administrator set another; 0 gives no one a default.
	SelfServeRate int `json:"self_serve_rate"`
	// MaxRate bounds the rate an administrator can grant.
	MaxRate         int `json:"max_rate"`
	SecondLevelRate int `json:"second_level_rate"`
	// MinWithdrawal is the smallest payout a channel can request.
	MinWithdrawal int `json:"min_withdrawal"`
	// GiftPlanId and RetailGiftPlanId are the subscription plans a
	// distributor's and a retail channel's invitees receive, free, when they
	// sign up; 0 gives that tier's invitees nothing.
	GiftPlanId       int `json:"gift_plan_id"`
	RetailGiftPlanId int `json:"retail_gift_plan_id"`
	// GiftDailyCap bounds the sign-up gifts one channel's invitees receive in
	// 24 hours; 0 is no bound.
	GiftDailyCap int `json:"gift_daily_cap"`
	// GiftBlockedEmailDomains lists address domains, one per line or comma
	// separated, whose sign-ups receive no gift.
	GiftBlockedEmailDomains string `json:"gift_blocked_email_domains"`
}

var affiliateSetting = AffiliateSetting{
	SelfServeRate:   10,
	MaxRate:         30,
	SecondLevelRate: 5,
	MinWithdrawal:   100,
	GiftDailyCap:    50,
}

func init() {
	config.GlobalConfig.Register("affiliate_setting", &affiliateSetting)
}

func GetAffiliateSetting() *AffiliateSetting {
	return &affiliateSetting
}

// ValidateAffiliateOption checks one affiliate_setting field value before it
// is saved.
func ValidateAffiliateOption(field string, value string) error {
	switch field {
	case "self_serve_rate", "max_rate", "second_level_rate":
		if number, err := strconv.Atoi(value); err != nil || number < 0 || number > 100 {
			return fmt.Errorf("Affiliate %s must be a whole percent between 0 and 100", field)
		}
	case "min_withdrawal", "gift_plan_id", "retail_gift_plan_id", "gift_daily_cap":
		if number, err := strconv.Atoi(value); err != nil || number < 0 {
			return fmt.Errorf("Affiliate %s must be a non-negative whole number", field)
		}
	}
	return nil
}

// GiftEmailDomainBlocked reports whether an address's domain is on
// GiftBlockedEmailDomains, matching the domain itself or any parent of it.
func (s *AffiliateSetting) GiftEmailDomainBlocked(email string) bool {
	at := strings.LastIndex(email, "@")
	if at < 0 {
		return false
	}
	domain := strings.ToLower(strings.TrimSpace(email[at+1:]))
	for blocked := range strings.FieldsFuncSeq(strings.ToLower(s.GiftBlockedEmailDomains), func(r rune) bool {
		return r == ',' || r == '\n' || r == '\r' || r == ' ' || r == '\t'
	}) {
		blocked = strings.TrimPrefix(blocked, "@")
		if domain == blocked || strings.HasSuffix(domain, "."+blocked) {
			return true
		}
	}
	return false
}
