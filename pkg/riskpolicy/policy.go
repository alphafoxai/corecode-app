// Detection semantics follow vm2api, Copyright (c) 2026 vm2api contributors;
// see LICENSE.vm2api.
package riskpolicy

import (
	"fmt"
	"strings"

	"github.com/tidwall/gjson"
)

// Input contains the original inbound request and the possibly transformed body.
// Set both to the same parsed request when no transformation has occurred.
type Input struct {
	Inbound    gjson.Result
	Body       gjson.Result
	Official   bool
	ZeroInject bool
}

// Hit describes the first match. A zero Hit means no rule matched. Excerpt is
// the latest user text, for the caller's existing event-excerpt handling.
type Hit struct {
	Stage   string
	Rule    string
	Detail  string
	Excerpt string
}

func needleHit(hay string, needles []namedText) *namedText {
	if hay == "" || len(needles) == 0 {
		return nil
	}
	hay = lowerJS(hay)
	for i := range needles {
		if strings.Contains(hay, needles[i].match) {
			return &needles[i]
		}
	}
	return nil
}

func fingerprintHit(hay string, fingerprints []namedText) *namedText {
	if hay == "" || len(fingerprints) == 0 {
		return nil
	}
	hay = normalizeText(hay)
	if hay == "" {
		return nil
	}
	for i := range fingerprints {
		if fingerprints[i].match != "" && strings.Contains(hay, fingerprints[i].match) {
			return &fingerprints[i]
		}
	}
	return nil
}

func matchDistill(config *distillConfig, input Input, prompt prompt) (Hit, error) {
	if needle := needleHit(prompt.joined, config.hardNeedles); needle != nil {
		return Hit{Stage: "distill", Rule: needle.name, Detail: needle.text, Excerpt: prompt.user}, nil
	}
	// Patterns test normalized joined text before official/zero exemptions.
	var hay string
	if len(config.patterns) > 0 {
		hay = normalizeText(prompt.joined)
	}
	if hay != "" {
		session, err := config.patterns[0].re.engine.get()
		if err != nil {
			return Hit{}, err
		}
		defer session.close()
		for _, pattern := range config.patterns {
			evidence, matched, err := session.match(pattern.re, hay, true)
			if err != nil {
				return Hit{}, fmt.Errorf("matching %s: %w", pattern.name, err)
			}
			if matched {
				if evidence == "" {
					break
				}
				return Hit{Stage: "distill", Rule: pattern.name, Detail: evidence, Excerpt: prompt.user}, nil
			}
		}
	}
	if config.skipOfficial && input.Official || config.skipZero && input.ZeroInject {
		return Hit{}, nil
	}
	fingerprintText := prompt.user
	if fingerprintText == "" {
		fingerprintText = prompt.joined
	}
	if fingerprint := fingerprintHit(fingerprintText, config.fingerprints); fingerprint != nil {
		return Hit{Stage: "distill", Rule: fingerprint.name, Detail: jsPrefix(fingerprint.text, 80), Excerpt: prompt.user}, nil
	}
	if needle := needleHit(prompt.joined, config.needles); needle != nil {
		return Hit{Stage: "distill", Rule: needle.name, Detail: needle.text, Excerpt: prompt.user}, nil
	}
	if config.contest != nil {
		session, err := config.contest.engine.get()
		if err != nil {
			return Hit{}, err
		}
		defer session.close()
		_, contest, err := session.match(config.contest, prompt.joined, false)
		if err != nil {
			return Hit{}, fmt.Errorf("matching contest pattern: %w", err)
		}
		if contest && isHarvest(input, config) {
			return Hit{Stage: "distill", Rule: "harvest", Detail: "contest+harvest", Excerpt: prompt.user}, nil
		}
	}
	return Hit{}, nil
}

func matchHard(rules []hardRule, input Input, distillOn, hardOn, openai bool, excerpt string) (Hit, error) {
	var document string
	prepared := false
	var session *regexSession
	defer func() {
		if session != nil {
			session.close()
		}
	}()
	for _, rule := range rules {
		if rule.distill {
			if !distillOn || openai {
				continue
			}
		} else if !hardOn {
			continue
		}
		if !prepared {
			document = hardDocument(input)
			prepared = true
			if document == "" {
				return Hit{}, nil
			}
		}
		if session == nil {
			var err error
			session, err = rule.re.engine.get()
			if err != nil {
				return Hit{}, err
			}
		}
		match, found, err := session.match(rule.re, document, false)
		if err != nil {
			return Hit{}, fmt.Errorf("matching hard rule %s: %w", rule.name, err)
		}
		if !found {
			continue
		}
		keyword := jsPrefix(normalizeWhitespace(match), 40)
		if keyword == "" {
			keyword = "custom"
			if strings.HasPrefix(rule.name, "vm2api.") {
				parts := strings.Split(rule.name, ".")
				if len(parts) > 2 && parts[1] != "" {
					keyword = parts[1]
				}
			}
		}
		stage := "hard_regex"
		if rule.distill {
			stage = "distill"
		}
		return Hit{Stage: stage, Rule: rule.name, Detail: keyword, Excerpt: excerpt}, nil
	}
	return Hit{}, nil
}

func normalizeWhitespace(s string) string {
	var out strings.Builder
	out.Grow(len(s))
	space := false
	for _, r := range s {
		if isJSSpace(r) {
			space = out.Len() > 0
			continue
		}
		if space {
			out.WriteByte(' ')
		}
		space = false
		out.WriteRune(r)
	}
	return out.String()
}

// Evaluate applies a structured distill configuration and ordered hard rules.
// Regex errors, including a finite match timeout, are returned to the caller;
// they are never silently interpreted as a clean match.
func Evaluate(distillSource, hardSource string, input Input, distillEnabled, hardEnabled bool) (Hit, error) {
	config, err := cachedDistill(distillSource)
	if err != nil {
		return Hit{}, err
	}
	openai := openaiModel(input)
	if openai && !config.openaiEnabled {
		return Hit{}, nil
	}
	distillOn := distillEnabled && config.enabled
	var p prompt
	if distillOn && !openai {
		p = extractPrompt(input)
		hit, err := matchDistill(config, input, p)
		if err != nil || hit.Stage != "" {
			return hit, err
		}
	}
	if !distillOn && !hardEnabled || openai && !hardEnabled {
		return Hit{}, nil
	}
	rules, err := cachedHard(hardSource)
	if err != nil {
		return Hit{}, err
	}
	if p.user == "" {
		p = extractPrompt(input)
	}
	return matchHard(rules, input, distillOn, hardEnabled, openai, p.user)
}
