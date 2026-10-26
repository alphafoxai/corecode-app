package system_setting

import (
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// AnalyticsSetting holds the analytics IDs written into the console's
// index.html. The page is rendered on every request, so a change shows on the
// next page load. An empty option falls back to the environment variable that
// configured it before (GOOGLE_ANALYTICS_ID, UMAMI_WEBSITE_ID, UMAMI_SCRIPT_URL).
type AnalyticsSetting struct {
	GoogleAnalyticsID string `json:"google_analytics_id"`
	UmamiWebsiteID    string `json:"umami_website_id"`
	UmamiScriptURL    string `json:"umami_script_url"`
}

var analyticsSetting = AnalyticsSetting{}

func init() {
	config.GlobalConfig.Register("analytics_setting", &analyticsSetting)
}

// GoogleAnalyticsID returns the GA4 measurement ID the console carries, or "".
func GoogleAnalyticsID() string {
	if analyticsSetting.GoogleAnalyticsID != "" {
		return analyticsSetting.GoogleAnalyticsID
	}
	return os.Getenv("GOOGLE_ANALYTICS_ID")
}

// UmamiAnalytics returns the Umami website ID and script URL the console
// carries. Both come from the options when the website ID is set there, and
// from the environment otherwise. An empty script URL means Umami's own.
func UmamiAnalytics() (websiteID string, scriptURL string) {
	if analyticsSetting.UmamiWebsiteID != "" {
		return analyticsSetting.UmamiWebsiteID, analyticsSetting.UmamiScriptURL
	}
	return os.Getenv("UMAMI_WEBSITE_ID"), os.Getenv("UMAMI_SCRIPT_URL")
}

var (
	googleAnalyticsIDPattern = regexp.MustCompile(`^G-[A-Z0-9]{4,20}$`)
	umamiWebsiteIDPattern    = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

// ValidateAnalyticsOption checks one analytics_setting field before it is
// saved. Each value is written into a script tag of every console page, so it
// must match its format exactly; an empty value removes it.
func ValidateAnalyticsOption(field string, value string) error {
	if value == "" {
		return nil
	}
	switch field {
	case "google_analytics_id":
		if !googleAnalyticsIDPattern.MatchString(value) {
			return fmt.Errorf("Google Analytics ID must be a GA4 measurement ID such as G-XXXXXXXXXX")
		}
	case "umami_website_id":
		if !umamiWebsiteIDPattern.MatchString(value) {
			return fmt.Errorf("Umami website ID must be a UUID")
		}
	case "umami_script_url":
		parsed, err := url.Parse(value)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil ||
			strings.ContainsAny(value, "\"'<>`\\ \t\r\n") {
			return fmt.Errorf("Umami script URL must be an absolute https URL")
		}
	default:
		return fmt.Errorf("unknown analytics setting %q", field)
	}
	return nil
}
