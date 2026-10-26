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
		case "/api/settings":
			_, _ = w.Write([]byte(`{"code":0,"data":{"values":{"credential_concurrency_limit":5,"quota_budget":{"enabled":true,"five_hour_percent":90,"seven_day_percent":95}}}}`))
		case "/api/groups":
			_, _ = w.Write([]byte(`{"code":0,"data":{"items":[{"id":1,"name":"us-01"},{"id":7,"name":"team-01"}],"total":2}}`))
		case "/api/home/subscription-accounts":
			_, _ = w.Write([]byte(`{"code":0,"data":{"items":[
				{"group_id":1,"credential":{"credential_id":6,"mask":"b***@x.com","effective_status":"available","observation":{"snapshot":{"plan_summary":{"name":"Max"},"account_summary":{"organization_rate_limit_tier":"default_claude_max_5x"},"quota_windows":[{"id":"five_hour","used":5},{"id":"seven_day","used":36}]}}}},
				{"group_id":7,"credential":{"credential_id":9,"effective_status":"available","observation":{"snapshot":{"quota_windows":[{"id":"five_hour","used":93},{"id":"seven_day","used":80}]}}}},
				{"group_id":7,"credential":{"credential_id":10,"effective_status":"cooldown","cooldown_until_ms":123}}
			]}}`))
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
	assert.Equal(t, 1, pool.EligibleAccounts, "the account over the five-hour budget and the cooling one are not eligible")
	assert.Equal(t, 5, pool.EffectiveSlots)
	require.Len(t, pool.Accounts, 3)
	assert.Equal(t, EngineAccount{CredentialID: 6, Group: "us-01", EmailMask: "b***@x.com", Plan: "Max", Tier: "default_claude_max_5x",
		Status: "available", FiveHour: 5, SevenDay: 36, Eligible: true}, pool.Accounts[0])
	assert.Equal(t, int64(123), pool.Accounts[2].CooldownUntil)

	operation_setting.EngineControlKey = "wrong"
	assert.Contains(t, FetchEnginePool(context.Background()).Error, "HTTP 401")
}
