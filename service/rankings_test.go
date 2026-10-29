package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestRankingBucketLabelReadsInViewerZone(t *testing.T) {
	config, err := rankingConfig("today")
	require.NoError(t, err)
	config.location = time.FixedZone("", 8*3600)
	// 16:00 UTC is midnight in UTC+8.
	require.Equal(t, "00:00", rankingBucketLabel(16*3600, config))

	config, err = rankingConfig("week")
	require.NoError(t, err)
	config.location = time.FixedZone("", -5*3600)
	// 00:00 UTC on Jan 2 1970 is still Jan 1 in UTC-5.
	require.Equal(t, "Jan 1", rankingBucketLabel(86400, config))
}
