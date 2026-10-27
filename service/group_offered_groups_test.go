package service

import (
	"testing"

	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The key form lists the offered groups. A user's own group that the operator did not offer
// may route to no channel, so it is left out, while a key that already names it still passes
// token authentication, which checks the usable groups.
func TestOfferedGroupsLeaveOutOwnGroupThatUsableGroupsKeep(t *testing.T) {
	original := setting.UserUsableGroups2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"vip":"VIP"}`))
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(original))
	})

	assert.Equal(t, map[string]string{"vip": "VIP"}, GetUserOfferedGroups("default"))
	assert.Equal(t, map[string]string{"vip": "VIP", "default": "User group"}, GetUserUsableGroups("default"))

	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"vip":"VIP","default":"Default"}`))
	assert.Equal(t, map[string]string{"vip": "VIP", "default": "Default"}, GetUserOfferedGroups("default"))
}
