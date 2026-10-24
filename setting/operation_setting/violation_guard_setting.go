package operation_setting

import (
	"fmt"
	"strconv"

	"github.com/QuantumNous/new-api/setting/config"
)

const (
	// ViolationGuardModeObserve records upstream refusals and what the policy
	// would have done, without restricting anyone.
	ViolationGuardModeObserve = "observe"
	// ViolationGuardModeEnforce suspends, bans and blocks as the policy says.
	ViolationGuardModeEnforce = "enforce"
)

// ViolationGuardSetting turns an upstream usage-policy refusal into a strike
// against the customer who sent the request. The first strike suspends the
// customer's relay access; BanStrikes strikes within StrikeWindowDays disable
// the account. A refused conversation stays blocked for the strike window.
type ViolationGuardSetting struct {
	Enabled bool   `json:"enabled"`
	Mode    string `json:"mode"`
	// SuspendHours is how long one strike suspends relay access. Refusals
	// inside this period, or within ten minutes when it is 0, belong to the
	// same strike.
	SuspendHours int `json:"suspend_hours"`
	// BanStrikes disables the account when its strikes within the window
	// reach this number; 0 never disables.
	BanStrikes       int `json:"ban_strikes"`
	StrikeWindowDays int `json:"strike_window_days"`
}

var violationGuardSetting = ViolationGuardSetting{
	Mode:             ViolationGuardModeObserve,
	SuspendHours:     24,
	BanStrikes:       2,
	StrikeWindowDays: 30,
}

func init() {
	config.GlobalConfig.Register("violation_guard_setting", &violationGuardSetting)
}

func GetViolationGuardSetting() *ViolationGuardSetting {
	return &violationGuardSetting
}

// ValidateViolationGuardOption checks one violation_guard_setting field value
// before it is saved.
func ValidateViolationGuardOption(field string, value string) error {
	switch field {
	case "mode":
		if value != ViolationGuardModeObserve && value != ViolationGuardModeEnforce {
			return fmt.Errorf("Violation guard mode must be observe or enforce")
		}
	case "suspend_hours", "ban_strikes":
		if number, err := strconv.Atoi(value); err != nil || number < 0 {
			return fmt.Errorf("Violation guard %s must be a non-negative whole number", field)
		}
	case "strike_window_days":
		if number, err := strconv.Atoi(value); err != nil || number < 1 {
			return fmt.Errorf("Violation guard strike window must be at least 1 day")
		}
	}
	return nil
}
