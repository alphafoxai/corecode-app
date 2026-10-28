// Package riskgate holds the detectors of the relay risk gate: rule matching,
// near-duplicate detection and the decision model client. It keeps no state
// about customers; service decides what a hit means.
package riskgate

import (
	"hash/fnv"
	"regexp"
	"slices"
	"strings"
	"sync"
	"unicode"

	"github.com/QuantumNous/new-api/setting/operation_setting"
)

type compiledRule struct {
	name    string
	pattern *regexp.Regexp
}

// RuleSet is a compiled rule list.
type RuleSet struct {
	rules []compiledRule
}

var ruleSetCache = struct {
	sync.Mutex
	sets map[string]*RuleSet
}{sets: map[string]*RuleSet{}}

// CompileRules compiles a "name | regex" rule list, reusing the result for the
// same source text. Lines that do not parse were rejected when the option was
// saved; any left are skipped.
func CompileRules(source string) *RuleSet {
	ruleSetCache.Lock()
	defer ruleSetCache.Unlock()
	if set := ruleSetCache.sets[source]; set != nil {
		return set
	}
	set := &RuleSet{}
	rules, _ := operation_setting.ParseRiskGateLines(source, true)
	for _, rule := range rules {
		set.rules = append(set.rules, compiledRule{name: rule.Name, pattern: regexp.MustCompile(rule.Text)})
	}
	// Only the current lists are ever looked up; drop superseded ones.
	if len(ruleSetCache.sets) >= 8 {
		clear(ruleSetCache.sets)
	}
	ruleSetCache.sets[source] = set
	return set
}

// Match returns the name of the first rule that matches any of texts, or "".
func (s *RuleSet) Match(texts ...string) string {
	for _, rule := range s.rules {
		for _, text := range texts {
			if text != "" && rule.pattern.MatchString(text) {
				return rule.name
			}
		}
	}
	return ""
}

// MaxFingerprintBytes is how much of a message is compared, the same length
// the violation guard keeps of a refused message.
const MaxFingerprintBytes = 4096

const (
	shingleRunes = 5
	// A message shorter than this is too common ("continue", "fix it") to
	// say anything by resembling a refused one.
	minFingerprintRunes = 32
)

// Fingerprint is the sorted set of hashed character shingles of a message.
type Fingerprint []uint64

// NewFingerprint fingerprints the start of text, ignoring case and
// whitespace. It is nil for a text too short to compare.
func NewFingerprint(text string) Fingerprint {
	text = text[:min(len(text), MaxFingerprintBytes)]
	runes := make([]rune, 0, len(text))
	for _, r := range strings.ToValidUTF8(text, "") {
		if !unicode.IsSpace(r) {
			runes = append(runes, unicode.ToLower(r))
		}
	}
	if len(runes) < minFingerprintRunes {
		return nil
	}
	fingerprint := make(Fingerprint, 0, len(runes)-shingleRunes+1)
	hash := fnv.New64a()
	for i := 0; i+shingleRunes <= len(runes); i++ {
		hash.Reset()
		_, _ = hash.Write([]byte(string(runes[i : i+shingleRunes])))
		fingerprint = append(fingerprint, hash.Sum64())
	}
	slices.Sort(fingerprint)
	return slices.Compact(fingerprint)
}

// Similarity is the Jaccard similarity of two fingerprints, 0 when either is
// empty.
func Similarity(a, b Fingerprint) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	shared, i, j := 0, 0, 0
	for i < len(a) && j < len(b) {
		switch {
		case a[i] == b[j]:
			shared++
			i++
			j++
		case a[i] < b[j]:
			i++
		default:
			j++
		}
	}
	return float64(shared) / float64(len(a)+len(b)-shared)
}
