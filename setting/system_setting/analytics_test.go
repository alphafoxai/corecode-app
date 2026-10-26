package system_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// The values are written into a script tag of every console page, so anything
// that could leave the attribute or the JavaScript string must be refused.
func TestValidateAnalyticsOption(t *testing.T) {
	cases := []struct {
		field, value string
		valid        bool
	}{
		{"google_analytics_id", "", true},
		{"google_analytics_id", "G-YX61KN6RQZ", true},
		{"google_analytics_id", "UA-12345-1", false},
		{"google_analytics_id", "G-ABC');alert(1);//", false},
		{"google_analytics_id", "g-yx61kn6rqz", false},
		{"umami_website_id", "94db1cb1-74f4-4a40-ad6c-962362670409", true},
		{"umami_website_id", "94db1cb1-74f4-4a40-ad6c-962362670409\"><script>", false},
		{"umami_script_url", "https://analytics.example.com/script.js", true},
		{"umami_script_url", "http://analytics.example.com/script.js", false},
		{"umami_script_url", "https://user:pass@analytics.example.com/script.js", false},
		{"umami_script_url", "https://analytics.example.com/s.js\"onload=\"alert(1)", false},
		{"umami_script_url", "//analytics.example.com/script.js", false},
		{"unknown", "x", false},
	}
	for _, tc := range cases {
		err := ValidateAnalyticsOption(tc.field, tc.value)
		if tc.valid {
			assert.NoError(t, err, "%s=%q", tc.field, tc.value)
		} else {
			assert.Error(t, err, "%s=%q", tc.field, tc.value)
		}
	}
}
