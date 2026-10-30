package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"

	"github.com/stretchr/testify/assert"
)

func TestEnginePlanValues(t *testing.T) {
	usd := func(value float64) *float64 { return &value }
	accounts := []EngineAccount{
		{Plan: "Pro", Tier: "default_claude_ai", SevenDayCapacityUSD: usd(240), SevenDayCapacitySource: "measured"},
		{Plan: "Pro", Tier: "default_claude_ai", SevenDayCapacityUSD: usd(260), SevenDayCapacitySource: "recent"},
		{Plan: "Pro", Tier: "default_claude_ai", SevenDayCapacityUSD: usd(250), SevenDayCapacitySource: "peer"},
		{Plan: "Pro", Tier: "default_claude_ai"},
		{Plan: "Max", Tier: "default_claude_max_5x", SevenDayCapacityUSD: usd(1050), SevenDayCapacitySource: "measured"},
		{Plan: "Team", Tier: "team_tier_1", SevenDayCapacityUSD: usd(950), SevenDayCapacitySource: "measured"},
		{Plan: "Team", Tier: "team_tier_1", SevenDayCapacityUSD: usd(1250), SevenDayCapacitySource: "measured"},
		{Plan: "Team", Tier: "team_tier_1", SevenDayCapacityUSD: usd(1000), SevenDayCapacitySource: "measured"},
		{Plan: "Team", Tier: "team_standard", SevenDayCapacityUSD: usd(0), SevenDayCapacitySource: "measured"},
		{Plan: "Grok Paid"},
	}
	assert.Equal(t, []EnginePlanValue{
		{Plan: "Pro", Tier: "default_claude_ai", Accounts: 4, Measured: 2, WeekUSD: 250, WeekLowUSD: 240, WeekHighUSD: 260},
		{Plan: "Team", Tier: "team_tier_1", Accounts: 3, Measured: 3, WeekUSD: 1000, WeekLowUSD: 950, WeekHighUSD: 1250},
		{Plan: "Max", Tier: "default_claude_max_5x", Accounts: 1, Measured: 1, WeekUSD: 1050, WeekLowUSD: 1050, WeekHighUSD: 1050},
	}, EnginePlanValues(accounts), "a peer capacity, a zero and an unmeasured plan are left out")
	assert.Equal(t, []EnginePlanValue{}, EnginePlanValues(nil))
}

func TestMatchClaudeCost(t *testing.T) {
	daily := []model.FinanceDay{{Day: 100, ClaudeUSD: 20}, {Day: 200, ClaudeUSD: 30}, {Day: 300, ClaudeUSD: 40}}
	cost := EngineDailyCost{Configured: true, Daily: []EngineCostDay{{Day: 200, CostUSD: 15}, {Day: 300, CostUSD: 21}}}
	official, charged := MatchClaudeCost(daily, cost)
	assert.Equal(t, 36.0, official)
	assert.Equal(t, 70.0, charged, "the day the engine did not report is left out of both sides")

	official, charged = MatchClaudeCost(daily, EngineDailyCost{Configured: true, Error: "down"})
	assert.Zero(t, official)
	assert.Zero(t, charged)
}
