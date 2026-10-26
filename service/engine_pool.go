package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// EngineAccount is one subscription account of corecode-engine's pool as the
// root dashboard shows it. The email is the engine's own mask.
type EngineAccount struct {
	CredentialID  int     `json:"credential_id"`
	Group         string  `json:"group"`
	EmailMask     string  `json:"email_mask"`
	Plan          string  `json:"plan"`
	Tier          string  `json:"tier"`
	Status        string  `json:"status"`
	FiveHour      float64 `json:"five_hour"`
	SevenDay      float64 `json:"seven_day"`
	FiveHourReset int64   `json:"five_hour_reset_ms"`
	SevenDayReset int64   `json:"seven_day_reset_ms"`
	CooldownUntil int64   `json:"cooldown_until_ms"`
	// Eligible reports an available account under both quota budgets, which
	// is what the engine's scheduler may send requests to.
	Eligible bool `json:"eligible"`
}

// EnginePool summarizes the pool for the capacity dashboard.
type EnginePool struct {
	Configured            bool            `json:"configured"`
	Error                 string          `json:"error,omitempty"`
	CredentialConcurrency int             `json:"credential_concurrency"`
	FiveHourBudget        float64         `json:"five_hour_budget"`
	SevenDayBudget        float64         `json:"seven_day_budget"`
	EligibleAccounts      int             `json:"eligible_accounts"`
	EffectiveSlots        int             `json:"effective_slots"`
	Accounts              []EngineAccount `json:"accounts"`
}

type engineEnvelope[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type engineSettings struct {
	Values struct {
		CredentialConcurrencyLimit int `json:"credential_concurrency_limit"`
		QuotaBudget                struct {
			Enabled         bool    `json:"enabled"`
			FiveHourPercent float64 `json:"five_hour_percent"`
			SevenDayPercent float64 `json:"seven_day_percent"`
		} `json:"quota_budget"`
	} `json:"values"`
}

type engineGroup struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// engineGroups accepts the group collection as a page ({"items": [...]}) or
// a bare array, so a pagination change in the engine does not break the
// dashboard.
type engineGroups []engineGroup

func (groups *engineGroups) UnmarshalJSON(data []byte) error {
	var list []engineGroup
	if err := common.Unmarshal(data, &list); err == nil {
		*groups = list
		return nil
	}
	var page struct {
		Items []engineGroup `json:"items"`
	}
	if err := common.Unmarshal(data, &page); err != nil {
		return err
	}
	*groups = page.Items
	return nil
}

type engineAccounts struct {
	Items []struct {
		GroupID    int `json:"group_id"`
		Credential struct {
			CredentialID    int    `json:"credential_id"`
			Mask            string `json:"mask"`
			EffectiveStatus string `json:"effective_status"`
			CooldownUntilMs *int64 `json:"cooldown_until_ms"`
			Observation     struct {
				Snapshot struct {
					PlanSummary struct {
						Name string `json:"name"`
					} `json:"plan_summary"`
					AccountSummary struct {
						Tier string `json:"organization_rate_limit_tier"`
					} `json:"account_summary"`
					QuotaWindows []struct {
						ID      string  `json:"id"`
						Used    float64 `json:"used"`
						ResetAt int64   `json:"reset_at_ms"`
					} `json:"quota_windows"`
				} `json:"snapshot"`
			} `json:"observation"`
		} `json:"credential"`
	} `json:"items"`
}

func engineGet[T any](ctx context.Context, base string, key string, path string) (T, error) {
	var zero T
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/api"+path, nil)
	if err != nil {
		return zero, err
	}
	request.Header.Set("Authorization", "Bearer "+key)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return zero, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return zero, err
	}
	if response.StatusCode != http.StatusOK {
		return zero, fmt.Errorf("engine %s returned HTTP %d", path, response.StatusCode)
	}
	var envelope engineEnvelope[T]
	if err := common.Unmarshal(body, &envelope); err != nil {
		return zero, fmt.Errorf("engine %s: %w", path, err)
	}
	if envelope.Code != 0 {
		return zero, fmt.Errorf("engine %s: %s", path, envelope.Message)
	}
	return envelope.Data, nil
}

// FetchEnginePool reads the pool from the engine's control API. A missing
// URL or key returns Configured false; a failed read returns the error in the
// result so the rest of the dashboard still renders.
func FetchEnginePool(ctx context.Context) EnginePool {
	base := strings.TrimRight(strings.TrimSpace(operation_setting.EngineControlURL), "/")
	key := strings.TrimSpace(operation_setting.EngineControlKey)
	if base == "" || key == "" {
		return EnginePool{Accounts: []EngineAccount{}}
	}
	pool := EnginePool{Configured: true, Accounts: []EngineAccount{}}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	settings, err := engineGet[engineSettings](ctx, base, key, "/settings")
	if err != nil {
		pool.Error = err.Error()
		return pool
	}
	pool.CredentialConcurrency = settings.Values.CredentialConcurrencyLimit
	if settings.Values.QuotaBudget.Enabled {
		pool.FiveHourBudget = settings.Values.QuotaBudget.FiveHourPercent
		pool.SevenDayBudget = settings.Values.QuotaBudget.SevenDayPercent
	}
	groups, err := engineGet[engineGroups](ctx, base, key, "/groups?page_size=100")
	if err != nil {
		pool.Error = err.Error()
		return pool
	}
	groupNames := make(map[int]string, len(groups))
	for _, group := range groups {
		groupNames[group.ID] = group.Name
	}
	accounts, err := engineGet[engineAccounts](ctx, base, key, "/home/subscription-accounts")
	if err != nil {
		pool.Error = err.Error()
		return pool
	}
	for _, item := range accounts.Items {
		credential := item.Credential
		account := EngineAccount{
			CredentialID: credential.CredentialID,
			Group:        groupNames[item.GroupID],
			EmailMask:    credential.Mask,
			Plan:         credential.Observation.Snapshot.PlanSummary.Name,
			Tier:         credential.Observation.Snapshot.AccountSummary.Tier,
			Status:       credential.EffectiveStatus,
		}
		if credential.CooldownUntilMs != nil {
			account.CooldownUntil = *credential.CooldownUntilMs
		}
		for _, window := range credential.Observation.Snapshot.QuotaWindows {
			switch window.ID {
			case "five_hour":
				account.FiveHour, account.FiveHourReset = window.Used, window.ResetAt
			case "seven_day":
				account.SevenDay, account.SevenDayReset = window.Used, window.ResetAt
			}
		}
		account.Eligible = account.Status == "available" &&
			(pool.FiveHourBudget == 0 || account.FiveHour < pool.FiveHourBudget) &&
			(pool.SevenDayBudget == 0 || account.SevenDay < pool.SevenDayBudget)
		if account.Eligible {
			pool.EligibleAccounts++
		}
		pool.Accounts = append(pool.Accounts, account)
	}
	pool.EffectiveSlots = pool.EligibleAccounts * pool.CredentialConcurrency
	return pool
}
