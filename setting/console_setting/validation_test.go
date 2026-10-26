package console_setting

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateConsoleSettingsTranslations(t *testing.T) {
	longAnswer := strings.Repeat("a", 1001)
	cases := []struct {
		name        string
		settingType string
		value       string
		wantErr     string
	}{
		{
			name:        "FAQ with an English translation is accepted",
			settingType: "FAQ",
			value:       `[{"question":"问题","answer":"回答","i18n":{"zh":{"question":"问题","answer":"回答"},"en":{"question":"Question","answer":"Answer"}}}]`,
		},
		{
			name:        "FAQ without i18n is accepted as before",
			settingType: "FAQ",
			value:       `[{"question":"问题","answer":"回答"}]`,
		},
		{
			name:        "FAQ translation over the answer limit is rejected like the base field",
			settingType: "FAQ",
			value:       `[{"question":"问题","answer":"回答","i18n":{"en":{"answer":"` + longAnswer + `"}}}]`,
			wantErr:     "FAQ #1 answer cannot exceed 1000 characters",
		},
		{
			name:        "FAQ translation that blanks a required field is rejected",
			settingType: "FAQ",
			value:       `[{"question":"问题","answer":"回答","i18n":{"en":{"question":""}}}]`,
			wantErr:     "FAQ #1 is missing the question field",
		},
		{
			name:        "API info translation with disallowed content is rejected",
			settingType: "ApiInfo",
			value:       `[{"url":"https://corecode.live","route":"路由","description":"说明","color":"orange","i18n":{"en":{"description":"<script>alert(1)</script>"}}}]`,
			wantErr:     "API info #1 contains disallowed content",
		},
		{
			name:        "announcement translation is accepted",
			settingType: "Announcements",
			value:       `[{"content":"上线","publishDate":"2026-10-21T08:00:00+08:00","type":"success","extra":"欢迎","i18n":{"en":{"content":"Launched","extra":"Welcome"}}}]`,
		},
		{
			name:        "announcement i18n that is not an object is rejected",
			settingType: "Announcements",
			value:       `[{"content":"上线","publishDate":"2026-10-21T08:00:00+08:00","i18n":["en"]}]`,
			wantErr:     "Invalid announcements format: entry #1: i18n must be an object keyed by locale",
		},
		{
			name:        "translated field that is not a string is rejected",
			settingType: "FAQ",
			value:       `[{"question":"问题","answer":"回答","i18n":{"en":{"answer":42}}}]`,
			wantErr:     "Invalid FAQ format: entry #1: i18n.en.answer must be a string",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateConsoleSettings(tc.value, tc.settingType)
			if tc.wantErr == "" {
				require.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.wantErr)
		})
	}
}
