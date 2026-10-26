package operation_setting

import (
	"fmt"
	"strconv"

	"github.com/QuantumNous/new-api/setting/config"
)

// AffiliateSetting runs the invite commission program. An affiliate earns
// their own rate on what the users they invited paid for and then consumed;
// an affiliate marked as a promotion channel also earns SecondLevelRate on the
// users their invitees invite. Rates are whole percents; money amounts are in
// the payment currency.
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
}

var affiliateSetting = AffiliateSetting{
	SelfServeRate:   10,
	MaxRate:         30,
	SecondLevelRate: 5,
	MinWithdrawal:   100,
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
	case "min_withdrawal":
		if number, err := strconv.Atoi(value); err != nil || number < 0 {
			return fmt.Errorf("Affiliate %s must be a non-negative whole number", field)
		}
	}
	return nil
}
