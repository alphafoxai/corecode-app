package operation_setting

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

// TokenSetting 令牌相关配置
type TokenSetting struct {
	MaxUserTokens int `json:"max_user_tokens"` // 每用户最大令牌数量
	// ConcurrencyLimits caps the requests one user may have in flight across
	// all of the user's tokens, by the user's group. A group that is absent or
	// set to 0 is not limited. The key keeps its token_setting name so stored
	// values and released consoles keep working.
	ConcurrencyLimits map[string]int `json:"concurrency_limits"`
}

// 默认配置
var tokenSetting = TokenSetting{
	MaxUserTokens:     1000, // 默认每用户最多 1000 个令牌
	ConcurrencyLimits: map[string]int{},
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("token_setting", &tokenSetting)
}

// GetTokenSetting 获取令牌配置
func GetTokenSetting() *TokenSetting {
	return &tokenSetting
}

// GetMaxUserTokens 获取每用户最大令牌数量
func GetMaxUserTokens() int {
	return GetTokenSetting().MaxUserTokens
}

// GetUserConcurrencyLimit returns how many requests one user in group may have
// in flight across all of the user's tokens; 0 means unlimited.
func GetUserConcurrencyLimit(group string) int {
	return max(GetTokenSetting().ConcurrencyLimits[group], 0)
}

// ValidateConcurrencyLimits checks the JSON value of
// token_setting.concurrency_limits: an object of group names to non-negative
// whole numbers.
func ValidateConcurrencyLimits(value string) error {
	var limits map[string]int
	if err := common.UnmarshalJsonStr(value, &limits); err != nil {
		return fmt.Errorf("Concurrency limits must be a JSON object of group names to whole numbers: %w", err)
	}
	for group, limit := range limits {
		if strings.TrimSpace(group) == "" || group != strings.TrimSpace(group) {
			return fmt.Errorf("Concurrency group names must be non-empty and have no surrounding spaces")
		}
		if limit < 0 {
			return fmt.Errorf("Concurrency limit for group %q cannot be negative", group)
		}
	}
	return nil
}
