package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFetchEnginePool(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch r.URL.Path {
		case "/api/group-concurrency":
			_, _ = w.Write([]byte(`{"code":0,"data":{"observed_at_ms":1000,"credential_limit":5,
				"default_quota_budget":{"enabled":true,"five_hour_percent":90,"seven_day_percent":95},
				"groups":[
					{"id":1,"name":"us-01","enabled":true,"current":2,"override_limit":null,"effective_limit":0,"quota_supported":true,
					 "quota_effective":{"enabled":true,"five_hour_percent":90,"seven_day_percent":95},"counts":{"total":1,"available":1},
					 "credentials":[{"id":6,"name":"#6","status":"available","five_hour":{"utilization":0.05,"reset_at_ms":7},"seven_day":{"utilization":0.36,"reset_at_ms":8},
					   "active":2,"sessions":3,"cooldown_until_ms":null,
					   "activity":{"last_used_at_ms":9,"last_failure_summary":"rate limited","last_failure_at_ms":10,"success_count":40,"failure_count":1},
					   "account":{"state":"fresh","observed_at_ms":11,"email":"bob@x.com","plan":"Max","tier":"default_claude_max_5x"}}]},
					{"id":7,"name":"team-01","enabled":true,"current":0,"override_limit":8,"effective_limit":8,"quota_supported":true,
					 "quota_effective":{"enabled":true,"five_hour_percent":90,"seven_day_percent":95},"counts":{"total":3,"available":2,"cooldown":1},
					 "credentials":[
					   {"id":8,"name":"a@y.com","status":"available","five_hour":{"utilization":0.1},"seven_day":{"utilization":0.2},"active":0,"sessions":0,"activity":null,"account":null},
					   {"id":9,"name":"c@y.com","status":"available","five_hour":{"utilization":null},"seven_day":{"utilization":null},"active":0,"sessions":0,"activity":null,"account":null},
					   {"id":10,"name":"d@y.com","status":"cooldown","five_hour":{},"seven_day":{},"active":0,"sessions":0,"cooldown_until_ms":123,"activity":null,"account":null}]},
					{"id":9,"name":"off","enabled":false,"current":0,"effective_limit":0,"quota_supported":true,"quota_effective":{"enabled":false},
					 "counts":{"total":1,"available":1},
					 "credentials":[{"id":12,"name":"e@z.com","status":"available","five_hour":{},"seven_day":{},"active":0,"sessions":0}]}
				]}}`))
		case "/api/group-concurrency/pool-estimate":
			_, _ = w.Write([]byte(`{"code":0,"data":{
				"five_hour":{"remaining_usd":400,"remaining_low_usd":380,"remaining_high_usd":420,"capacity_usd":600,"counted":4,"unknown":1},
				"week":{"remaining_usd":2500,"remaining_low_usd":2400,"remaining_high_usd":2600,"capacity_usd":4000,"counted":4,"unknown":1},
				"refills":[{"credential_id":6,"name":"bob@x.com","at_ms":99,"adds_usd":20}],
				"accounts":[{"credential_id":6,"five_hour":{"remaining_usd":150},"seven_day":{"remaining_usd":800},"burn_usd_per_hour":9.5}]}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	previousURL, previousKey := operation_setting.EngineControlURL, operation_setting.EngineControlKey
	t.Cleanup(func() {
		operation_setting.EngineControlURL, operation_setting.EngineControlKey = previousURL, previousKey
	})

	operation_setting.EngineControlURL, operation_setting.EngineControlKey = "", ""
	assert.False(t, FetchEnginePool(context.Background()).Configured)

	operation_setting.EngineControlURL, operation_setting.EngineControlKey = server.URL+"/", "secret"
	pool := FetchEnginePool(context.Background())
	require.Empty(t, pool.Error)
	assert.Equal(t, 5, pool.CredentialConcurrency)
	assert.Equal(t, 2, pool.InFlight)
	require.Len(t, pool.Accounts, 5, "every account of every group, not just the home page's")
	assert.Equal(t, 3, pool.EligibleAccounts, "the cooling account and the disabled group's account are not eligible")
	assert.Equal(t, 5+8, pool.EffectiveSlots, "team-01's two accounts give ten slots, capped at its limit of eight")
	require.Len(t, pool.Groups, 3)
	assert.Equal(t, EngineGroup{ID: 7, Name: "team-01", Enabled: true, EffectiveLimit: 8, OverrideLimit: pool.Groups[1].OverrideLimit,
		Accounts: 3, Eligible: 2, Slots: 8, Counts: map[string]int{"total": 3, "available": 2, "cooldown": 1},
		QuotaBudget: true, FiveHourBudget: 90, SevenDayBudget: 95}, pool.Groups[1])
	assert.Equal(t, 8, *pool.Groups[1].OverrideLimit)
	assert.Zero(t, pool.Groups[2].Slots, "a disabled group serves nothing")

	first := pool.Accounts[0]
	assert.Equal(t, "b***@x.com", first.EmailMask, "the email is masked before it reaches the console")
	assert.Equal(t, 5.0, first.FiveHour)
	assert.Equal(t, 36.0, first.SevenDay)
	assert.Equal(t, int64(8), first.SevenDayReset)
	assert.Equal(t, 3, first.Sessions)
	assert.Equal(t, int64(40), first.Successes)
	assert.Equal(t, "rate limited", first.LastFailure)
	assert.Equal(t, "Max", first.Plan)
	assert.Equal(t, 150.0, *first.FiveHourRemainingUSD)
	assert.Equal(t, 9.5, *first.BurnUSDPerHour)
	assert.Nil(t, pool.Accounts[1].FiveHourRemainingUSD)
	assert.Equal(t, "a***@y.com", pool.Accounts[1].EmailMask)
	assert.Equal(t, int64(123), pool.Accounts[3].CooldownUntil)
	require.NotNil(t, pool.FiveHour)
	assert.Equal(t, 400.0, pool.FiveHour.RemainingUSD)
	assert.Equal(t, []EngineRefill{{CredentialID: 6, At: 99, AddsUSD: 20}}, pool.Refills)

	operation_setting.EngineControlKey = "wrong"
	assert.Contains(t, FetchEnginePool(context.Background()).Error, "HTTP 401")
}
