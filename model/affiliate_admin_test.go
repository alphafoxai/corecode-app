package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAffiliateAdminDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			useAffiliateTestDB(t, dialect)
			page := func() *common.PageInfo { return &common.PageInfo{Page: 1, PageSize: 20} }
			listed := func(filter AffiliateListFilter) []int {
				items, total, err := ListAffiliates(filter, page())
				require.NoError(t, err)
				ids := make([]int, 0, len(items))
				for _, item := range items {
					ids = append(ids, item.UserId)
				}
				assert.EqualValues(t, len(ids), total)
				return ids
			}

			// A channel with two invitees, B a default affiliate with one, and
			// a user with no affiliate row and no invitees.
			a := registerAffiliateTestUser(t, "adm_a", "")
			_, err := SetAffiliate(a.Id, 25, true, 1)
			require.NoError(t, err)
			b := registerAffiliateTestUser(t, "adm_b", a.AffCode)
			registerAffiliateTestUser(t, "adm_b2", a.AffCode)
			require.NoError(t, EnsureDefaultAffiliate(b.Id))
			c := registerAffiliateTestUser(t, "adm_c", b.AffCode)
			idle := registerAffiliateTestUser(t, "adm_idle", "")
			require.NoError(t, DB.Where("user_id = ?", idle.Id).Delete(&Affiliate{}).Error)

			// The program was off when D invited E, so D has no affiliate row.
			d := registerAffiliateTestUser(t, "adm_d", "")
			require.NoError(t, DB.Where("user_id = ?", d.Id).Delete(&Affiliate{}).Error)
			e := registerAffiliateTestUser(t, "adm_e", "")
			require.NoError(t, DB.Model(&User{}).Where("id = ?", e.Id).Update("inviter_id", d.Id).Error)

			all := listed(AffiliateListFilter{})
			assert.Equal(t, a.Id, all[0], "the most invitees come first")
			assert.Contains(t, all, d.Id, "an inviter without an affiliate row is listed")
			assert.NotContains(t, all, idle.Id)
			assert.Equal(t, []int{a.Id}, listed(AffiliateListFilter{Type: "channel"}))
			assert.ElementsMatch(t, []int{a.Id, b.Id, d.Id}, listed(AffiliateListFilter{Type: "inviting"}))
			assert.Equal(t, []int{b.Id}, listed(AffiliateListFilter{Keyword: "adm_b", Type: "inviting"}))
			assert.Equal(t, []int{a.Id}, listed(AffiliateListFilter{Keyword: a.AffCode}))

			items, _, err := ListAffiliates(AffiliateListFilter{Keyword: "adm_a"}, page())
			require.NoError(t, err)
			require.Len(t, items, 1)
			assert.Equal(t, AffiliateListItem{
				UserId: a.Id, Username: "adm_a", DisplayName: "adm_a", Status: common.UserStatusEnabled,
				AffCode: a.AffCode, HasAffiliate: true, Rate: 25, Channel: true, InviteeCount: 2,
			}, *items[0])
			items, _, err = ListAffiliates(AffiliateListFilter{Keyword: "adm_d"}, page())
			require.NoError(t, err)
			require.Len(t, items, 1)
			assert.False(t, items[0].HasAffiliate)
			assert.EqualValues(t, 1, items[0].InviteeCount)

			_, err = SetAffiliate(c.Id, 0, false, 1)
			require.NoError(t, err)
			assert.Equal(t, []int{c.Id}, listed(AffiliateListFilter{Type: "revoked"}))

			overview, err := GetAffiliateOverview()
			require.NoError(t, err)
			assert.EqualValues(t, 3, overview.Inviters)
			assert.EqualValues(t, 1, overview.Channels)
			assert.EqualValues(t, 4, overview.Invitees)

			// A custom code binds sign-ups, retires the old one and is unique
			// without regard to case.
			oldCode := a.AffCode
			code, err := SetUserAffCode(a.Id, " Partner-01 ")
			require.NoError(t, err)
			assert.Equal(t, "Partner-01", code)
			assert.Zero(t, InviterIdForAffCode(oldCode))
			f := registerAffiliateTestUser(t, "adm_f", "Partner-01")
			assert.Equal(t, a.Id, f.InviterId)
			_, err = SetUserAffCode(b.Id, "partner-01")
			assert.ErrorIs(t, err, ErrAffiliateCodeTaken)
			_, err = SetUserAffCode(a.Id, "partner-01")
			assert.NoError(t, err, "a user may change the case of their own code")
			for _, invalid := range []string{"ab", "has space", "中文码", "a/b", "abcdefghijklmnopqrstuvwxyz0123456"} {
				_, err = SetUserAffCode(b.Id, invalid)
				assert.ErrorIs(t, err, ErrAffiliateCodeInvalid, invalid)
			}
		})
	}
}
