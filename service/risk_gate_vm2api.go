package service

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf16"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/riskpolicy"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

// Client recognition follows vm2api 1.4.023 (06e5a0be1d89), copyright
// 2026 vm2api contributors. See pkg/riskpolicy/LICENSE.vm2api.
var (
	riskOfficialUA         = regexp.MustCompile(`(?i)^claude-cli/\d+\.\d+\.\d+`)
	riskOfficialID         = regexp.MustCompile(`^user_([a-fA-F0-9]{64})_account_([a-fA-F0-9-]*)_session_([a-fA-F0-9-]{36})$`)
	riskOfficialIdentity   = regexp.MustCompile(`(?i)You are Claude Code\b|Claude Agent SDK`)
	riskOfficialEntrypoint = regexp.MustCompile(`(?i)cc_entrypoint\s*=\s*(cli|sdk-cli|vscode|cowork|desktop|claude-vscode|claude-desktop(?:-3p)?)\b`)
	riskLocalEntrypoint    = regexp.MustCompile(`(?i)cc_entrypoint\s*=\s*local-agent\b`)
	riskHarnessName        = regexp.MustCompile(`(?i)\b(?:oh my pi|pi coding harness|omp coding harness)\b`)
	riskHarnessRole        = regexp.MustCompile(`(?m)^ROLE\s*\n\s*=+`)
	riskHarnessProject     = regexp.MustCompile(`(?m)^PROJECT\s*\n\s*=+`)
	riskDesktopEntrypoint  = regexp.MustCompile(`[ (,]local-agent[),]`)
	riskDesktopSDK         = regexp.MustCompile(`[ (,]agent-sdk/\d+\.\d+\.\d+[),]`)
	riskClientVersion      = regexp.MustCompile(`^\d+\.\d+\.\d+$`)
)

func riskGatePolicyInput(c *gin.Context, source string) (riskpolicy.Input, error) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return riskpolicy.Input{}, err
	}
	raw, err := storage.Bytes()
	if err != nil {
		return riskpolicy.Input{}, err
	}
	body := gjson.ParseBytes(raw)
	if !body.IsObject() {
		return riskpolicy.Input{}, errors.New("risk policy requires a JSON request object")
	}
	detectProxy := gjson.Get(source, "detect_proxied_official_cc")
	return riskpolicy.Input{
		Inbound: body, Body: body,
		Official:   riskGateOfficialClient(c.Request.Header, body, !detectProxy.Exists() || detectProxy.Bool()),
		ZeroInject: gjson.Get(source, "zero_inject").Bool(),
	}, nil
}

func riskGateSystemBlocks(system gjson.Result) []string {
	if system.Type == gjson.String {
		return []string{system.Str}
	}
	if !system.IsArray() {
		if text := system.Get("text"); text.Type == gjson.String {
			return []string{text.Str}
		}
		return nil
	}
	var blocks []string
	system.ForEach(func(_, block gjson.Result) bool {
		if block.Type == gjson.String {
			blocks = append(blocks, block.Str)
		} else if text := block.Get("text"); text.Type == gjson.String {
			blocks = append(blocks, text.Str)
		}
		return true
	})
	return blocks
}

func riskGateOfficialUserID(id gjson.Result) bool {
	if id.IsObject() {
		return riskGateTruthy(id.Get("device_id")) && riskGateTruthy(id.Get("session_id"))
	}
	text := strings.TrimSpace(id.String())
	if strings.HasPrefix(text, "{") {
		parsed := gjson.Parse(text)
		return riskGateTruthy(parsed.Get("device_id")) && riskGateTruthy(parsed.Get("session_id"))
	}
	return riskOfficialID.MatchString(text)
}

func riskGateTruthy(value gjson.Result) bool {
	switch value.Type {
	case gjson.String:
		return value.Str != ""
	case gjson.Number:
		return value.Num != 0
	case gjson.True:
		return true
	case gjson.JSON:
		return true
	default:
		return false
	}
}

func riskGateSecurityMonitor(text string) bool {
	if !strings.HasPrefix(strings.TrimLeft(text, " \t\n\r\v\f\u00a0\ufeff"), "You are a security monitor for autonomous AI coding agents.") {
		return false
	}
	size := 0
	for _, r := range text {
		size += utf16.RuneLen(r)
	}
	if size < 10000 {
		return false
	}
	for _, marker := range []string{"## Threat Model", "- `<transcript>`:", "## HARD BLOCK", "## SOFT BLOCK", "## Classification Process", "## Output Format"} {
		if !strings.Contains(text, marker) {
			return false
		}
	}
	return true
}

func riskGateOfficialClient(headers http.Header, body gjson.Result, detectProxy bool) bool {
	blocks := riskGateSystemBlocks(body.Get("system"))
	text := strings.Join(blocks, "\n")
	lower := strings.ToLower(text)
	ua := strings.TrimSpace(headers.Get("User-Agent"))
	desktop := riskOfficialUA.MatchString(ua) && riskDesktopEntrypoint.MatchString(ua) && riskDesktopSDK.MatchString(ua) && headers.Get("anthropic-client-platform") == "desktop_app" && riskClientVersion.MatchString(strings.TrimSpace(headers.Get("anthropic-client-version")))
	harness := (riskLocalEntrypoint.MatchString(text) && !desktop) || (strings.Contains(lower, "<system-conventions>") && (strings.Contains(lower, "oh my pi") || strings.Contains(lower, "<workstation>"))) || (riskHarnessRole.MatchString(text) && riskHarnessProject.MatchString(text)) || riskHarnessName.MatchString(text)
	if harness {
		return false
	}
	openAITools := false
	body.Get("tools").ForEach(func(_, tool gjson.Result) bool {
		if tool.Get("type").String() == "function" || (riskGateTruthy(tool.Get("function")) && !riskGateTruthy(tool.Get("name"))) {
			openAITools = true
			return false
		}
		return true
	})
	if openAITools || strings.EqualFold(body.Get("tool_choice.type").String(), "function") {
		return false
	}
	identity := riskOfficialIdentity.MatchString(text)
	systemOfficial := strings.Contains(lower, "x-anthropic-billing-header:") || (!riskLocalEntrypoint.MatchString(text) && riskOfficialEntrypoint.MatchString(text)) || identity
	relayed := identity
	billing := false
	for _, block := range blocks {
		for _, prefix := range []string{"You are Claude Code, Anthropic's official CLI for Claude", "You are a Claude agent, built on Anthropic's Claude Agent SDK", "You are a file search specialist for Claude Code", "You are a helpful AI assistant tasked with summarizing conversations", "You are an interactive CLI tool that helps users", "You are an assistant for performing a web search tool use"} {
			if strings.HasPrefix(strings.TrimSpace(block), prefix) {
				systemOfficial = true
			}
		}
		if riskGateSecurityMonitor(block) {
			systemOfficial = true
			relayed = true
		}
		if strings.Contains(strings.ToLower(block), "x-anthropic-billing-header") && strings.Contains(strings.ToLower(block), "cc_entrypoint=") {
			billing = true
		}
		if (strings.Contains(block, "# Doing tasks") && strings.Contains(block, "# Tone and style")) || strings.Contains(strings.ToLower(block), "you are an interactive agent that helps users with software engineering tasks") || strings.Contains(block, "Help the user complete the current request") {
			relayed = true
		}
	}
	validID := riskGateOfficialUserID(body.Get("metadata.user_id"))
	if riskOfficialUA.MatchString(ua) && validID && systemOfficial {
		return true
	}
	if !detectProxy {
		return false
	}
	// Proxied-client recognition intentionally rejects the local-agent stealth
	// shape even when direct desktop traffic qualified above.
	if riskLocalEntrypoint.MatchString(text) {
		return false
	}
	if billing {
		return true
	}
	if !validID || !relayed {
		return false
	}
	for beta := range strings.SplitSeq(headers.Get("anthropic-beta"), ",") {
		if strings.TrimSpace(beta) == "claude-code-20250219" {
			return true
		}
	}
	return false
}
