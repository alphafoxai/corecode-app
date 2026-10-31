package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOfficialPriceMarkup(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, UpdateOfficialPriceMarkupByJSONString("{}")) })

	require.NoError(t, UpdateOfficialPriceMarkupByJSONString(`{"claude-fable-5-1":1.5}`))
	markup, ok := GetOfficialPriceMarkup("claude-fable-5-1")
	assert.True(t, ok)
	assert.Equal(t, 1.5, markup)

	markup, ok = GetOfficialPriceMarkup("claude-opus-5-5")
	assert.False(t, ok)
	assert.Equal(t, 1.0, markup)

	for _, value := range []string{`{"claude-fable-5-1":0}`, `{"claude-fable-5-1":-2}`, `not json`} {
		assert.Error(t, UpdateOfficialPriceMarkupByJSONString(value), value)
		markup, _ = GetOfficialPriceMarkup("claude-fable-5-1")
		assert.Equal(t, 1.5, markup, "a rejected value keeps the previous map")
	}
}
