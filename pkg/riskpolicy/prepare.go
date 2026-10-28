// Text preparation follows vm2api, Copyright (c) 2026 vm2api contributors;
// see LICENSE.vm2api.
package riskpolicy

import (
	"encoding/base64"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	reminderOpen  = "<system-reminder>"
	reminderClose = "</system-reminder>"
	minBase64Run  = 32
	maxBase64Run  = 64 * 1024
	maxDecoded    = 64 * 1024
	maxSegments   = 8
	maxPasses     = 3
)

func asciiFoldIndex(text, needle string) int {
	for i := 0; i+len(needle) <= len(text); i++ {
		matched := true
		for j := range len(needle) {
			c := text[i+j]
			if c >= 'A' && c <= 'Z' {
				c += 'a' - 'A'
			}
			if c != needle[j] {
				matched = false
				break
			}
		}
		if matched {
			return i
		}
	}
	return -1
}

func stripReminders(text string) string {
	if asciiFoldIndex(text, reminderOpen) < 0 {
		return text
	}
	var out strings.Builder
	for {
		open := asciiFoldIndex(text, reminderOpen)
		if open < 0 {
			out.WriteString(text)
			break
		}
		out.WriteString(text[:open])
		after := text[open+len(reminderOpen):]
		close := asciiFoldIndex(after, reminderClose)
		if close < 0 {
			out.WriteString(text[open:])
			break
		}
		text = after[close+len(reminderClose):]
	}
	return trimJS(out.String())
}

var environmentHeading = regexp.MustCompile(`^[ \t]*# Environment\b`)

func environmentMetadata(line string) bool {
	// JavaScript `$` may also match immediately before a final line terminator.
	line = strings.TrimSuffix(line, "\r")
	line = strings.TrimSuffix(line, "\u2028")
	line = strings.TrimSuffix(line, "\u2029")
	line = strings.TrimLeft(line, " \t")
	if environmentHeading.MatchString(line) {
		return !strings.ContainsAny(line, "\r\u2028\u2029")
	}
	const invoked = "You have been invoked in the following environment:"
	if strings.HasPrefix(line, invoked) {
		return strings.TrimFunc(line[len(invoked):], isJSSpace) == ""
	}
	if !strings.HasPrefix(line, "-") {
		return false
	}
	rest := line[1:]
	trimmed := strings.TrimLeftFunc(rest, isJSSpace)
	return len(rest) != len(trimmed) && trimmed != "" && !strings.ContainsAny(trimmed, "\r\u2028\u2029")
}

func stripEnvironment(text string) string {
	var out []string
	dropping := false
	for _, line := range strings.Split(text, "\n") {
		if !dropping {
			if environmentHeading.MatchString(line) {
				dropping = true
			} else {
				out = append(out, line)
			}
			continue
		}
		if trimJS(line) == "" {
			dropping = false
			out = append(out, line)
			continue
		}
		if !environmentMetadata(line) {
			dropping = false
			out = append(out, line)
		}
	}
	return trimJS(strings.Join(out, "\n"))
}

func isBase64Byte(c byte) bool {
	return c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '+' || c == '/' || c == '='
}

func decodeBase64Text(run string) string {
	if len(run) > maxBase64Run {
		run = run[:maxBase64Run-(maxBase64Run%4)]
	}
	if len(run)%4 != 0 {
		return ""
	}
	raw, err := base64.StdEncoding.Strict().DecodeString(run)
	if err != nil || len(raw) == 0 || !utf8.Valid(raw) || base64.StdEncoding.EncodeToString(raw) != run {
		return ""
	}
	chars, printable, letters := 0, 0, 0
	for _, ch := range string(raw) {
		chars++
		if ch == '\n' || ch == '\r' || ch == '\t' {
			printable++
			continue
		}
		if ch == ' ' || ch > ' ' && ch != 127 {
			printable++
			if unicode.IsLetter(ch) {
				letters++
			}
		}
	}
	if chars == 0 || letters == 0 || printable*10 < chars*9 {
		return ""
	}
	return string(raw)
}

func expandBase64Once(text string) string {
	var out strings.Builder
	last, decoded, segments := 0, 0, 0
	changed := false
	for i := 0; i < len(text); {
		if !isBase64Byte(text[i]) {
			i++
			continue
		}
		end := i
		for end < len(text) && isBase64Byte(text[end]) {
			end++
		}
		if end-i >= minBase64Run && segments < maxSegments && decoded < maxDecoded {
			if plain := decodeBase64Text(text[i:end]); plain != "" {
				out.WriteString(text[last:i])
				out.WriteString(plain)
				last = end
				decoded += jsLength(plain)
				segments++
				changed = true
			}
		}
		i = end
	}
	if !changed {
		return text
	}
	out.WriteString(text[last:])
	return out.String()
}

func prepareText(text string) string {
	text = stripEnvironment(stripReminders(text))
	for range maxPasses {
		next := expandBase64Once(text)
		if next == text {
			break
		}
		text = next
	}
	return trimJS(text)
}
