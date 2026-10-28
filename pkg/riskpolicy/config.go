// Package riskpolicy implements deterministic prompt policy detection.
// Detection semantics are derived from vm2api (Copyright (c) 2026 vm2api
// contributors), revision 06e5a0be1d89cd74e0f60f12f44646179ab1977b;
// see LICENSE.vm2api for the upstream license.
package riskpolicy

import (
	"fmt"
	"github.com/tidwall/gjson"
	"math"
	"regexp"
	"strings"
	"sync"
	"unicode/utf16"
)

type namedText struct {
	name  string
	text  string
	match string
}

type namedPattern struct {
	name   string
	source string
	re     *jsPattern
}

type distillConfig struct {
	enabled       bool
	skipOfficial  bool
	skipZero      bool
	openaiEnabled bool
	minTokens     float64
	noTools       bool
	singleTurn    bool
	contest       *jsPattern
	hardNeedles   []namedText
	needles       []namedText
	fingerprints  []namedText
	patterns      []namedPattern
}

type hardRule struct {
	name    string
	distill bool
	re      *jsPattern
}

// Cache the most recently used immutable configuration of each kind. Option
// changes replace the entry, so edits do not grow a process-wide regex cache.
var distillCache struct {
	sync.Mutex
	source string
	config *distillConfig
}
var hardCache struct {
	sync.Mutex
	source string
	rules  []hardRule
	ready  bool
}

func jsLength(text string) int {
	count := 0
	for _, r := range text {
		count++
		if r > 0xffff {
			count++
		}
	}
	return count
}

func jsPrefix(text string, units int) string {
	if jsLength(text) <= units {
		return text
	}
	encoded := utf16.Encode([]rune(text))
	return string(utf16.Decode(encoded[:units]))
}

func requiredBool(object gjson.Result, key string) (bool, error) {
	value := object.Get(key)
	if value.Type != gjson.True && value.Type != gjson.False {
		return false, fmt.Errorf("%s must be a boolean", key)
	}
	return value.Bool(), nil
}

func optionalBool(object gjson.Result, key string, fallback bool) (bool, error) {
	value := object.Get(key)
	if !value.Exists() {
		return fallback, nil
	}
	return requiredBool(object, key)
}

func readTexts(object gjson.Result, key, prefix string, max int, normalize bool) ([]namedText, error) {
	value := object.Get(key)
	if !value.IsArray() {
		return nil, fmt.Errorf("%s must be an array of strings", key)
	}
	items := value.Array()
	if len(items) > max {
		return nil, fmt.Errorf("%s may contain at most %d entries", key, max)
	}
	out := make([]namedText, 0, len(items))
	for _, item := range items {
		if item.Type != gjson.String {
			return nil, fmt.Errorf("%s entries must be strings", key)
		}
		text := trimJS(item.Str)
		if text == "" {
			continue
		}
		match := lowerJS(text)
		if normalize {
			match = normalizeText(text)
		}
		out = append(out, namedText{name: fmt.Sprintf("%s.%02d", prefix, len(out)+1), text: text, match: match})
	}
	return out, nil
}

func parseDistill(source string) (*distillConfig, error) {
	if !gjson.Valid(source) {
		return nil, fmt.Errorf("distill rules must be valid JSON")
	}
	root := gjson.Parse(source)
	if !root.IsObject() {
		return nil, fmt.Errorf("distill rules must be a JSON object")
	}
	config := &distillConfig{}
	engine, err := sharedRegexEngine()
	if err != nil {
		return nil, err
	}
	session, err := engine.get()
	if err != nil {
		return nil, err
	}
	defer session.close()
	if config.enabled, err = requiredBool(root, "enabled"); err != nil {
		return nil, err
	}
	if config.skipOfficial, err = requiredBool(root, "skip_official"); err != nil {
		return nil, err
	}
	if config.skipZero, err = requiredBool(root, "skip_zero"); err != nil {
		return nil, err
	}
	if config.openaiEnabled, err = optionalBool(root, "openai_platform_enabled", false); err != nil {
		return nil, err
	}
	for _, key := range []string{"zero_inject", "detect_proxied_official_cc"} {
		if _, err = optionalBool(root, key, false); err != nil {
			return nil, err
		}
	}
	if raw := root.Get("error"); raw.Exists() {
		if !raw.IsObject() {
			return nil, fmt.Errorf("error must be an object")
		}
		if status := raw.Get("status"); status.Exists() && (status.Type != gjson.Number || status.Num < 400 || status.Num > 599) {
			return nil, fmt.Errorf("error.status must be between 400 and 599")
		}
		for _, key := range []string{"type", "code", "message"} {
			value := raw.Get(key)
			if value.Exists() && value.Type != gjson.String {
				return nil, fmt.Errorf("error.%s must be a string", key)
			}
			if key == "message" && value.Exists() && trimJS(value.Str) == "" {
				return nil, fmt.Errorf("error.message must not be empty")
			}
		}
	}
	structure := root.Get("structure")
	if !structure.IsObject() {
		return nil, fmt.Errorf("structure must be an object")
	}
	min := structure.Get("min_max_tokens")
	if min.Type != gjson.Number || min.Num <= 0 || math.IsInf(min.Num, 0) || math.IsNaN(min.Num) {
		return nil, fmt.Errorf("structure.min_max_tokens must be a positive number")
	}
	config.minTokens = math.Floor(min.Num)
	if config.noTools, err = requiredBool(structure, "require_no_tools"); err != nil {
		return nil, fmt.Errorf("structure.%w", err)
	}
	if config.singleTurn, err = requiredBool(structure, "require_single_turn"); err != nil {
		return nil, fmt.Errorf("structure.%w", err)
	}
	contest := structure.Get("contest_pattern")
	if contest.Type != gjson.String {
		return nil, fmt.Errorf("structure.contest_pattern must be a string")
	}
	contestSource := trimJS(contest.Str)
	if jsLength(contestSource) > 400 {
		return nil, fmt.Errorf("structure.contest_pattern exceeds 400 UTF-16 units")
	}
	if contestSource != "" {
		if config.contest, err = compilePattern(session, contestSource); err != nil {
			return nil, fmt.Errorf("invalid structure.contest_pattern: %w", err)
		}
	}
	if config.hardNeedles, err = readTexts(root, "hard_needles", "hard_needle", 200, false); err != nil {
		return nil, err
	}
	if config.needles, err = readTexts(root, "needles", "needle", 200, false); err != nil {
		return nil, err
	}
	if config.fingerprints, err = readTexts(root, "fingerprints", "fingerprint", 200, true); err != nil {
		return nil, err
	}
	// Upstream removes hard needles from the ordinary list, case-insensitively.
	hardSet := make(map[string]struct{}, len(config.hardNeedles))
	for _, needle := range config.hardNeedles {
		hardSet[needle.match] = struct{}{}
	}
	ordinary := config.needles[:0]
	for _, needle := range config.needles {
		if _, found := hardSet[needle.match]; !found {
			needle.name = fmt.Sprintf("needle.%02d", len(ordinary)+1)
			ordinary = append(ordinary, needle)
		}
	}
	config.needles = ordinary
	patterns, err := readTexts(root, "patterns", "pattern", 50, false)
	if err != nil {
		return nil, err
	}
	for _, pattern := range patterns {
		if jsLength(pattern.text) > 400 {
			return nil, fmt.Errorf("%s exceeds 400 UTF-16 units", pattern.name)
		}
		re, err := compilePattern(session, pattern.text)
		if err != nil {
			return nil, fmt.Errorf("invalid %s: %w", pattern.name, err)
		}
		config.patterns = append(config.patterns, namedPattern{name: pattern.name, source: pattern.text, re: re})
	}
	return config, nil
}

func cachedDistill(source string) (*distillConfig, error) {
	distillCache.Lock()
	defer distillCache.Unlock()
	if distillCache.config != nil && distillCache.source == source {
		return distillCache.config, nil
	}
	config, err := parseDistill(source)
	if err != nil {
		return nil, err
	}
	distillCache.source, distillCache.config = source, config
	return config, nil
}

var ruleName = regexp.MustCompile(`^[\p{L}\p{N}_.:-]{1,48}$`)

func parseHard(source string) ([]hardRule, error) {
	engine, err := sharedRegexEngine()
	if err != nil {
		return nil, err
	}
	session, err := engine.get()
	if err != nil {
		return nil, err
	}
	defer session.close()
	var rules []hardRule
	names := make(map[string]struct{})
	for lineNumber, line := range strings.Split(source, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		name, pattern, found := strings.Cut(line, "|")
		name, pattern = strings.TrimSpace(name), strings.TrimSpace(pattern)
		if !found || pattern == "" {
			return nil, fmt.Errorf("line %d must be written as name | regex", lineNumber+1)
		}
		if !ruleName.MatchString(name) {
			return nil, fmt.Errorf("line %d has an invalid rule name", lineNumber+1)
		}
		if _, duplicate := names[name]; duplicate {
			return nil, fmt.Errorf("line %d repeats rule name %s", lineNumber+1, name)
		}
		names[name] = struct{}{}
		re, err := compilePattern(session, pattern)
		if err != nil {
			return nil, fmt.Errorf("line %d has an invalid regex: %w", lineNumber+1, err)
		}
		rules = append(rules, hardRule{name: name, distill: strings.HasPrefix(name, "vm2api.distill."), re: re})
	}
	return rules, nil
}

func cachedHard(source string) ([]hardRule, error) {
	hardCache.Lock()
	defer hardCache.Unlock()
	if hardCache.ready && hardCache.source == source {
		return hardCache.rules, nil
	}
	rules, err := parseHard(source)
	if err != nil {
		return nil, err
	}
	hardCache.source, hardCache.rules, hardCache.ready = source, rules, true
	return rules, nil
}

// ValidateDistill validates a complete structured configuration without loading defaults.
func ValidateDistill(source string) error {
	_, err := cachedDistill(source)
	return err
}

// ValidateHard validates the operator's ordered name | regex rules.
func ValidateHard(source string) error {
	_, err := cachedHard(source)
	return err
}
