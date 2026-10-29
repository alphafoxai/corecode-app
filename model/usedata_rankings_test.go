package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRankingQuotaCountsCacheTokens(t *testing.T) {
	truncateTables(t)
	rows := []QuotaData{
		{UserID: 1, Username: "alice", ModelName: "claude-a", CreatedAt: 3600, TokenUsed: 100, CacheReadTokens: 9000, CacheCreationTokens: 400},
		{UserID: 2, Username: "bob", ModelName: "claude-a", CreatedAt: 7200, TokenUsed: 50, CacheReadTokens: 450},
		{UserID: 1, Username: "alice", ModelName: "gpt-a", CreatedAt: 3600, TokenUsed: 2000},
	}
	require.NoError(t, DB.Create(&rows).Error)

	totals, err := GetRankingQuotaTotals(0, 10000)
	require.NoError(t, err)
	require.Equal(t, []RankingQuotaTotal{
		{ModelName: "claude-a", TotalTokens: 10000},
		{ModelName: "gpt-a", TotalTokens: 2000},
	}, totals)

	buckets, err := GetRankingQuotaBuckets(0, 10000, 3600, 0)
	require.NoError(t, err)
	require.ElementsMatch(t, []RankingQuotaBucket{
		{ModelName: "claude-a", Bucket: 3600, Tokens: 9500},
		{ModelName: "claude-a", Bucket: 7200, Tokens: 500},
		{ModelName: "gpt-a", Bucket: 3600, Tokens: 2000},
	}, buckets)
}

func TestRankingQuotaBucketsStartAtViewerMidnight(t *testing.T) {
	truncateTables(t)
	const day = 86400
	const shanghai = 8 * 3600
	rows := []QuotaData{
		// 15:00 UTC on day 1 is 23:00 in UTC+8: still day 1 there.
		{UserID: 1, Username: "alice", ModelName: "claude-a", CreatedAt: day + 15*3600, TokenUsed: 10},
		// 16:00 UTC on day 1 is 00:00 on day 2 in UTC+8.
		{UserID: 1, Username: "alice", ModelName: "claude-a", CreatedAt: day + 16*3600, TokenUsed: 20},
	}
	require.NoError(t, DB.Create(&rows).Error)

	buckets, err := GetRankingQuotaBuckets(0, 3*day, day, 0)
	require.NoError(t, err)
	require.ElementsMatch(t, []RankingQuotaBucket{
		{ModelName: "claude-a", Bucket: day, Tokens: 30},
	}, buckets)

	buckets, err = GetRankingQuotaBuckets(0, 3*day, day, shanghai)
	require.NoError(t, err)
	require.ElementsMatch(t, []RankingQuotaBucket{
		{ModelName: "claude-a", Bucket: day - shanghai, Tokens: 10},
		{ModelName: "claude-a", Bucket: 2*day - shanghai, Tokens: 20},
	}, buckets)
}
