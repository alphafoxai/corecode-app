package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Shape of a request sent by the interactive Claude Code 2.1.301 CLI (captured
// against a local stub; device and session ids replaced, prompt shortened).
const claudeCodeCLIUserAgent = "claude-cli/2.1.301 (external, cli)"

var claudeCodeCLIHeaders = map[string]string{
	"User-Agent":        claudeCodeCLIUserAgent,
	"X-App":             "cli",
	"anthropic-beta":    "claude-code-20250219,interleaved-thinking-2025-05-14,context-management-2025-06-27",
	"anthropic-version": "2023-06-01",
}

const claudeCodeCLIBody = `{
  "model": "claude-sonnet-5-5",
  "max_tokens": 128000,
  "stream": true,
  "metadata": {"user_id": "{\"device_id\":\"5b2c0a8e4f1d6b3a9c7e0d2f4a6b8c1e3d5f7a9b0c2e4d6f8a1b3c5d7e9f0a2b\",\"account_uuid\":\"\",\"session_id\":\"0f6b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d\"}"},
  "system": [
    {"type": "text", "text": "x-anthropic-billing-header: cc_version=2.1.301.b14; cc_entrypoint=cli;"},
    {"type": "text", "text": "You are Claude Code, Anthropic's official CLI for Claude.", "cache_control": {"type": "ephemeral"}},
    {"type": "text", "text": "\nYou are an agent working with the user toward their goals, using your own judgment along the way.\n"}
  ],
  "messages": [{"role": "user", "content": "say ok"}]
}`

const legacyClaudeCodeUserID = "user_5b2c0a8e4f1d6b3a9c7e0d2f4a6b8c1e3d5f7a9b0c2e4d6f8a1b3c5d7e9f0a2b_account__session_0f6b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d"

func setClaudeCodeClientSetting(t *testing.T, value operation_setting.ClaudeCodeClientSetting) {
	t.Helper()
	setting := operation_setting.GetClaudeCodeClientSetting()
	previous := *setting
	*setting = value
	t.Cleanup(func() { *setting = previous })
}

func runClaudeCodeGate(t *testing.T, group string, autoGroups []string, path string, headers map[string]string, body string) (*httptest.ResponseRecorder, bool) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	// A request without a body is a GET, as model lists are.
	method := http.MethodPost
	if body == "" {
		method = http.MethodGet
	}
	c.Request = httptest.NewRequest(method, path, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Request.Header.Set("Accept-Language", "en")
	for name, value := range headers {
		c.Request.Header.Set(name, value)
	}
	common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
	if autoGroups != nil {
		common.SetContextKey(c, constant.ContextKeyTokenAutoGroups, autoGroups)
	}
	return recorder, enforceClaudeCodeOnlyGroup(c, "default")
}

func withHeader(name, value string) map[string]string {
	headers := make(map[string]string, len(claudeCodeCLIHeaders))
	for key, existing := range claudeCodeCLIHeaders {
		headers[key] = existing
	}
	if value == "" {
		delete(headers, name)
	} else {
		headers[name] = value
	}
	return headers
}

func TestClaudeCodeOnlyGroupGate(t *testing.T) {
	require.NoError(t, i18n.Init())
	setClaudeCodeClientSetting(t, operation_setting.ClaudeCodeClientSetting{Groups: []string{"cc"}})
	originalUsableGroups := setting.UserUsableGroups2JSONString()
	originalRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","cc":"Claude Code"}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"cc":1}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(originalUsableGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(originalRatios))
	})

	sdkBody := strings.NewReplacer(
		"cc_entrypoint=cli", "cc_entrypoint=sdk-cli",
		"You are Claude Code, Anthropic's official CLI for Claude.", "You are a Claude agent, built on Anthropic's Claude Agent SDK.",
	).Replace(claudeCodeCLIBody)
	withoutBillingBlock := strings.Replace(claudeCodeCLIBody,
		`{"type": "text", "text": "x-anthropic-billing-header: cc_version=2.1.301.b14; cc_entrypoint=cli;"},`, "", 1)
	foreignPrompt := `{"model":"claude-sonnet-5-5","max_tokens":1024,"metadata":{"user_id":"` + legacyClaudeCodeUserID + `"},` +
		`"system":[{"type":"text","text":"You are a helpful translation assistant for a mobile app."}],"messages":[{"role":"user","content":"hi"}]}`
	stringSystem := `{"model":"claude-sonnet-5-5","max_tokens":1024,"metadata":{"user_id":"` + legacyClaudeCodeUserID + `"},` +
		`"system":"You are Claude Code, Anthropic's official CLI for Claude.","messages":[{"role":"user","content":"hi"}]}`
	legacyUserID := strings.Replace(claudeCodeCLIBody, `"metadata": {"user_id": "{\"device_id\":\"5b2c0a8e4f1d6b3a9c7e0d2f4a6b8c1e3d5f7a9b0c2e4d6f8a1b3c5d7e9f0a2b\",\"account_uuid\":\"\",\"session_id\":\"0f6b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d\"}"}`,
		`"metadata": {"user_id": "`+legacyClaudeCodeUserID+`"}`, 1)
	endUserID := strings.Replace(legacyUserID, legacyClaudeCodeUserID, "customer-42", 1)
	probe := `{"model":"claude-sonnet-5-5","max_tokens":1,"messages":[{"role":"user","content":"count"}]}`

	tests := []struct {
		name       string
		group      string
		autoGroups []string
		path       string
		headers    map[string]string
		body       string
		allowed    bool
	}{
		{"interactive Claude Code", "cc", nil, "/v1/messages", claudeCodeCLIHeaders, claudeCodeCLIBody, true},
		{"claude -p through the Agent SDK prompt", "cc", nil, "/v1/messages", withHeader("User-Agent", "claude-cli/2.1.301 (external, sdk-cli)"), sdkBody, true},
		{"identity sentence without the billing block", "cc", nil, "/v1/messages", claudeCodeCLIHeaders, withoutBillingBlock, true},
		{"legacy metadata.user_id", "cc", nil, "/v1/messages", claudeCodeCLIHeaders, legacyUserID, true},
		{"max_tokens=1 probe without a prompt", "cc", nil, "/v1/messages", claudeCodeCLIHeaders, probe, true},
		{"model list from Claude Code", "cc", nil, "/v1/models", claudeCodeCLIHeaders, "", true},
		{"group without the restriction", "default", nil, "/v1/messages", map[string]string{"User-Agent": "curl/8.7.1"}, foreignPrompt, true},
		{"same body from another client", "cc", nil, "/v1/messages", withHeader("User-Agent", "Anthropic/Python 0.70.0"), claudeCodeCLIBody, false},
		{"model list from another client", "cc", nil, "/v1/models", map[string]string{"User-Agent": "curl/8.7.1"}, "", true},
		{"single model from another client", "cc", nil, "/v1/models/claude-sonnet-5-5", map[string]string{"User-Agent": "curl/8.7.1"}, "", true},
		{"auto token listing models from another client", "auto", []string{"default", "cc"}, "/v1/models", map[string]string{"User-Agent": "curl/8.7.1"}, "", true},
		{"Gemini model path from another client", "cc", nil, "/v1beta/models/claude-sonnet-5-5:generateContent", map[string]string{"User-Agent": "curl/8.7.1"}, foreignPrompt, false},
		{"Claude Code User-Agent with a foreign prompt", "cc", nil, "/v1/messages", claudeCodeCLIHeaders, foreignPrompt, false},
		{"system prompt as a plain string", "cc", nil, "/v1/messages", claudeCodeCLIHeaders, stringSystem, false},
		{"missing X-App", "cc", nil, "/v1/messages", withHeader("X-App", ""), claudeCodeCLIBody, false},
		{"missing anthropic-beta", "cc", nil, "/v1/messages", withHeader("anthropic-beta", ""), claudeCodeCLIBody, false},
		{"end-user metadata.user_id", "cc", nil, "/v1/messages", claudeCodeCLIHeaders, endUserID, false},
		{"auto token that can land in the group", "auto", []string{"default", "cc"}, "/v1/messages", map[string]string{"User-Agent": "curl/8.7.1"}, foreignPrompt, false},
		{"auto token outside the group", "auto", []string{"default"}, "/v1/messages", map[string]string{"User-Agent": "curl/8.7.1"}, foreignPrompt, true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder, allowed := runClaudeCodeGate(t, test.group, test.autoGroups, test.path, test.headers, test.body)
			require.Equal(t, test.allowed, allowed)
			if test.allowed {
				return
			}
			assert.Equal(t, http.StatusForbidden, recorder.Code)
			assert.Contains(t, recorder.Body.String(), "Group cc only accepts requests from Claude Code")
			assert.Contains(t, recorder.Body.String(), `"code":"access_denied"`)
		})
	}
}

func TestClaudeCodeOnlyGroupVersionBounds(t *testing.T) {
	require.NoError(t, i18n.Init())

	tests := []struct {
		name       string
		minVersion string
		maxVersion string
		message    string
	}{
		{"inside the bounds", "2.1.78", "2.1.301", ""},
		{"older than the minimum", "2.1.302", "", "Claude Code 2.1.301 is older than 2.1.302, the oldest version group cc accepts. Run claude update"},
		{"minimum compared numerically", "2.1.1000", "", "Claude Code 2.1.301 is older than 2.1.1000"},
		{"newer than the maximum", "", "2.1.300", "Claude Code 2.1.301 is newer than 2.1.300, the newest version group cc accepts. Install Claude Code 2.1.300"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setClaudeCodeClientSetting(t, operation_setting.ClaudeCodeClientSetting{
				Groups: []string{"cc"}, MinVersion: test.minVersion, MaxVersion: test.maxVersion,
			})
			recorder, allowed := runClaudeCodeGate(t, "cc", nil, "/v1/messages", claudeCodeCLIHeaders, claudeCodeCLIBody)
			if test.message == "" {
				assert.True(t, allowed)
				return
			}
			require.False(t, allowed)
			assert.Equal(t, http.StatusForbidden, recorder.Code)
			assert.Contains(t, recorder.Body.String(), test.message)
		})
	}
}

func TestClaudeCodeClientSettingValidation(t *testing.T) {
	for _, value := range []string{"", "2.1.78", "10.0.123"} {
		assert.NoError(t, operation_setting.ValidateClaudeCodeVersion(value), value)
	}
	for _, value := range []string{"2.1", "v2.1.78", "2.1.78-beta", " 2.1.78"} {
		assert.Error(t, operation_setting.ValidateClaudeCodeVersion(value), value)
	}
	for _, value := range []string{`[]`, `["cc","vip"]`} {
		assert.NoError(t, operation_setting.ValidateClaudeCodeClientGroups(value), value)
	}
	for _, value := range []string{`cc`, `{"cc":true}`, `[""]`, `[" cc"]`} {
		assert.Error(t, operation_setting.ValidateClaudeCodeClientGroups(value), value)
	}
}
