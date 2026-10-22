package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newAnthropicPoolTestChannel(t *testing.T, baseURL string) *model.Channel {
	t.Helper()
	channel := &model.Channel{Type: constant.ChannelTypeAnthropic, BaseURL: &baseURL, Key: "sk-gl-test", Name: "gpt-load-claude"}
	require.NoError(t, model.DB.Create(channel).Error)
	return channel
}

func TestUpdateChannelAnthropicPoolBalanceStoresWeeklyRemainder(t *testing.T) {
	setupSub2APIBalanceTest(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/pool/balance", r.URL.Path)
		assert.Equal(t, "Bearer sk-gl-test", r.Header.Get("Authorization"))
		_, _ = w.Write([]byte(`{"is_active":true,"balance":1122.6,"five_hour":{"remaining_usd":238.8},"week":{"remaining_usd":1122.6}}`))
	}))
	defer server.Close()

	channel := newAnthropicPoolTestChannel(t, server.URL+"/")
	balance, err := updateStandardChannelBalance(channel)
	require.NoError(t, err)
	assert.InDelta(t, 1122.6, balance, 1e-9)
	assert.InDelta(t, 1122.6, channel.Balance, 1e-9)
	assert.NotZero(t, channel.BalanceUpdatedTime)
}

func TestUpdateChannelAnthropicPoolBalanceNeverStoresAMissingValue(t *testing.T) {
	for name, response := range map[string]struct {
		status int
		body   string
	}{
		"unavailable": {http.StatusServiceUnavailable, `{"error":{"code":"pool_balance_unavailable"}}`},
		"not a pool":  {http.StatusNotFound, `{}`},
		"inactive":    {http.StatusOK, `{"is_active":false,"balance":10}`},
		"no balance":  {http.StatusOK, `{"is_active":true}`},
		"negative":    {http.StatusOK, `{"is_active":true,"balance":-1}`},
	} {
		t.Run(name, func(t *testing.T) {
			setupSub2APIBalanceTest(t)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(response.status)
				_, _ = w.Write([]byte(response.body))
			}))
			defer server.Close()
			channel := newAnthropicPoolTestChannel(t, server.URL)
			_, err := updateStandardChannelBalance(channel)
			require.Error(t, err)
			assert.Zero(t, channel.BalanceUpdatedTime)
		})
	}
}

func TestUpdateChannelAnthropicOfficialHostIsNotQueried(t *testing.T) {
	setupSub2APIBalanceTest(t)
	channel := newAnthropicPoolTestChannel(t, "https://api.anthropic.com")
	_, err := updateStandardChannelBalance(channel)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Not implemented")
}
