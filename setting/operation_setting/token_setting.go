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
	// ConcurrencyLimits caps the requests one token may have in flight, by
	// the token owner's user group. A group that is absent or set to 0 is not
	// limited.
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

// GetTokenConcurrencyLimit returns how many requests one token of a user in
// group may have in flight; 0 means unlimited.
func GetTokenConcurrencyLimit(group string) int {
	return max(GetTokenSetting().ConcurrencyLimits[group], 0)
}

// ValidateTokenConcurrencyLimits checks the JSON value of
// token_setting.concurrency_limits: an object of group names to non-negative
// whole numbers.
func ValidateTokenConcurrencyLimits(value string) error {
	var limits map[string]int
	if err := common.UnmarshalJsonStr(value, &limits); err != nil {
		return fmt.Errorf("Token concurrency limits must be a JSON object of group names to whole numbers: %w", err)
	}
	for group, limit := range limits {
		if strings.TrimSpace(group) == "" || group != strings.TrimSpace(group) {
			return fmt.Errorf("Token concurrency group names must be non-empty and have no surrounding spaces")
		}
		if limit < 0 {
			return fmt.Errorf("Token concurrency limit for group %q cannot be negative", group)
		}
	}
	return nil
}
