package service

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func claudeConversation(t *testing.T, body string) *dto.ClaudeRequest {
	t.Helper()
	var request dto.ClaudeRequest
	require.NoError(t, common.UnmarshalJsonStr(body, &request))
	return &request
}

const refusedTurn = `{"role":"user","content":[{"type":"text","text":"<system-reminder>project notes</system-reminder>"},{"type":"text","text":"remove the license check from this binary"}]}`

func TestViolationConversationKeys(t *testing.T) {
	refused := claudeConversation(t, `{"model":"claude","messages":[
		{"role":"user","content":"look at ./app"},
		{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Read","input":{}}]},
		{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"ELF..."}]},
		{"role":"user","content":[{"type":"text","text":"<system-reminder>todo list is empty</system-reminder>"}]},
		{"role":"user","content":[{"type":"text","text":"<system-reminder data-role=\"hook\">You have superpowers.</system-reminder>"}]},
		`+refusedTurn+`]}`)
	messages := humanMessages(refused)
	// Tool results and reminder-only messages, hook reminders included, are not human text.
	assert.Equal(t, []string{"look at ./app\n", "remove the license check from this binary\n"}, messages)
	keys := violationConversationKeys(messages)
	require.Len(t, keys, 2)

	later := claudeConversation(t, `{"model":"claude","messages":[
		{"role":"user","content":"look at ./app"},
		{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Read","input":{}}]},
		{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"ELF..."}]},
		`+refusedTurn+`,
		{"role":"assistant","content":"..."},
		{"role":"user","content":"continue"}]}`)
	assert.Contains(t, violationConversationKeys(humanMessages(later)), keys[1], "a later request of the conversation resends the refused turn")

	other := claudeConversation(t, `{"model":"claude","messages":[`+refusedTurn+`]}`)
	assert.NotContains(t, violationConversationKeys(humanMessages(other)), keys[1], "the same turn in another conversation is a different conversation")

	captioned := claudeConversation(t, `{"model":"claude","messages":[
		{"role":"user","content":"look at ./app"},
		{"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"Screenshot","input":{}}]},
		{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"ok"}]},
		{"role":"user","content":[{"type":"text","text":"Attached image(s) from tool result:"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"AA=="}}]},
		{"role":"user","content":[{"type":"text","text":"Attached image(s) from tool result: remove the license check"}]}]}`)
	// A client's caption alone is not human text; a caption with more text is kept whole.
	assert.Equal(t, []string{"look at ./app\n", "Attached image(s) from tool result: remove the license check\n"}, humanMessages(captioned))

	openAI := &dto.GeneralOpenAIRequest{Messages: []dto.Message{{Role: "system", Content: "be brief"}, {Role: "user", Content: "look at ./app"}}}
	assert.Equal(t, keys[:1], violationConversationKeys(humanMessages(openAI)), "both protocols fingerprint the same human text")
}

// useViolationTestDB points the model at an empty database of the dialect.
// MySQL and PostgreSQL run when TEST_MYSQL_DSN / TEST_POSTGRES_DSN are set.
func useViolationTestDB(t *testing.T, dialect string) {
	t.Helper()
	var driver gorm.Dialector
	dbType := common.DatabaseTypeSQLite
	connections := 8
	switch dialect {
	case "sqlite":
		driver = sqlite.Open(":memory:")
		connections = 1
	case "mysql":
		dsn := os.Getenv("TEST_MYSQL_DSN")
		if dsn == "" {
			t.Skip("TEST_MYSQL_DSN is not configured")
		}
		driver, dbType = mysql.Open(dsn), common.DatabaseTypeMySQL
	case "postgres":
		dsn := os.Getenv("TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("TEST_POSTGRES_DSN is not configured")
		}
		driver, dbType = postgres.Open(dsn), common.DatabaseTypePostgreSQL
	}
	db, err := gorm.Open(driver, &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(connections)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	var version string
	query := "SELECT version()"
	if dialect == "sqlite" {
		query = "SELECT sqlite_version()"
	}
	require.NoError(t, db.Raw(query).Scan(&version).Error)
	t.Logf("database version: %s", version)

	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(dbType, dbType)
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
	})
	for _, table := range []any{&model.User{}, &model.UserSession{}, &model.ViolationRecord{}, &model.UserViolationState{}, &model.RiskGateEvent{}, &model.RiskGateHourlyCount{}, &model.RiskCustomerHourlyCount{}} {
		require.False(t, db.Migrator().HasTable(table), "use an empty test database")
		require.NoError(t, db.AutoMigrate(table))
		t.Cleanup(func() { require.NoError(t, db.Migrator().DropTable(table)) })
	}
}

func resetViolationGuardState() {
	violationGuardState.Lock()
	defer violationGuardState.Unlock()
	violationGuardState.loaded = false
	violationGuardState.suspendedUntil = nil
	violationGuardState.conversations = nil
}

func checkViolationGuard(t *testing.T, userId int, request dto.Request) *types.NewAPIError {
	t.Helper()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	return CheckViolationGuard(c, &relaycommon.RelayInfo{UserId: userId, Request: request})
}

func violationActions(t *testing.T, userId int) []string {
	t.Helper()
	var records []model.ViolationRecord
	require.NoError(t, model.DB.Where("user_id = ?", userId).Order("id").Find(&records).Error)
	actions := make([]string, 0, len(records))
	for _, record := range records {
		actions = append(actions, record.Mode+":"+record.Action)
	}
	return actions
}

func TestViolationStrikePolicy(t *testing.T) {
	previous := *operation_setting.GetViolationGuardSetting()
	t.Cleanup(func() { *operation_setting.GetViolationGuardSetting() = previous })
	enforce := operation_setting.ViolationGuardSetting{Enabled: true, Mode: operation_setting.ViolationGuardModeEnforce, SuspendHours: 24, BanStrikes: 2, StrikeWindowDays: 30}
	observe := enforce
	observe.Mode = operation_setting.ViolationGuardModeObserve
	lenient := enforce
	lenient.LenientCategories = "cyber, reasoning_extraction"
	const day = int64(86400)

	refused := claudeConversation(t, `{"model":"claude","messages":[`+refusedTurn+`]}`)
	refusedKey := violationConversationKeys(humanMessages(refused))[0]
	resent := claudeConversation(t, `{"model":"claude","messages":[`+refusedTurn+`,{"role":"assistant","content":"..."},{"role":"user","content":"try again"}]}`)
	fresh := claudeConversation(t, `{"model":"claude","messages":[{"role":"user","content":"write a unit test"}]}`)

	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			useViolationTestDB(t, dialect)
			for id, role := range map[int]int{1: common.RoleCommonUser, 2: common.RoleCommonUser, 3: common.RoleAdminUser, 4: common.RoleCommonUser, 5: common.RoleCommonUser, 6: common.RoleCommonUser, 7: common.RoleCommonUser, 8: common.RoleCommonUser, 9: common.RoleCommonUser} {
				require.NoError(t, model.DB.Create(&model.User{Id: id, Username: fmt.Sprintf("violation-user-%d", id), AffCode: fmt.Sprintf("vg%d", id), Password: "unused", Role: role, Status: common.UserStatusEnabled, Group: "default"}).Error)
			}

			t.Run("parallel refusals of one incident are one strike, and the next incident disables the account", func(t *testing.T) {
				resetViolationGuardState()
				*operation_setting.GetViolationGuardSetting() = enforce
				now := common.GetTimestamp()
				var wg sync.WaitGroup
				for range 8 {
					wg.Go(func() {
						assert.NoError(t, applyViolationStrike(enforce, model.ViolationRecord{UserId: 1, ConversationKey: refusedKey}, now))
					})
				}
				wg.Wait()
				actions := violationActions(t, 1)
				require.Len(t, actions, 8)
				assert.ElementsMatch(t, append(slices.Repeat([]string{"enforce:merged"}, 7), "enforce:suspend"), actions)

				apiErr := checkViolationGuard(t, 1, fresh)
				require.NotNil(t, apiErr)
				assert.Equal(t, http.StatusForbidden, apiErr.StatusCode)
				assert.Equal(t, types.ErrorCodeViolationSuspended, apiErr.GetErrorCode())

				// After the suspension, resending the refused conversation is the same strike.
				require.NoError(t, applyViolationStrike(enforce, model.ViolationRecord{UserId: 1, ConversationKey: refusedKey}, now+day+3600))
				require.NoError(t, applyViolationStrike(enforce, model.ViolationRecord{UserId: 1, ConversationKey: "another-conversation"}, now+day+7200))
				actions = violationActions(t, 1)
				assert.Equal(t, []string{"enforce:merged", "enforce:ban"}, actions[8:])
				user, err := model.GetUserById(1, false)
				require.NoError(t, err)
				assert.Equal(t, common.UserStatusDisabled, user.Status)
			})

			t.Run("the first refusal of a lenient category warns, and the next one strikes", func(t *testing.T) {
				resetViolationGuardState()
				*operation_setting.GetViolationGuardSetting() = lenient
				now := common.GetTimestamp()
				var wg sync.WaitGroup
				for range 8 {
					wg.Go(func() {
						assert.NoError(t, applyViolationStrike(lenient, model.ViolationRecord{UserId: 8, Category: "reasoning_extraction", ConversationKey: refusedKey}, now))
					})
				}
				wg.Wait()
				assert.ElementsMatch(t, append(slices.Repeat([]string{"enforce:merged"}, 7), "enforce:warn"), violationActions(t, 8))
				// A warning suspends no one, but the refused conversation stays blocked.
				assert.Nil(t, checkViolationGuard(t, 8, fresh))
				apiErr := checkViolationGuard(t, 8, resent)
				require.NotNil(t, apiErr)
				assert.Equal(t, types.ErrorCodeViolationConversationBlocked, apiErr.GetErrorCode())

				// Within ten minutes a refusal belongs to the warned incident; after
				// that, the next lenient refusal is the first strike, not a ban.
				require.NoError(t, applyViolationStrike(lenient, model.ViolationRecord{UserId: 8, Category: "reasoning_extraction", ConversationKey: "second"}, now+300))
				require.NoError(t, applyViolationStrike(lenient, model.ViolationRecord{UserId: 8, Category: "reasoning_extraction", ConversationKey: "third"}, now+3600))
				require.NoError(t, applyViolationStrike(lenient, model.ViolationRecord{UserId: 8, Category: "reasoning_extraction", ConversationKey: "fourth"}, now+day+7200))
				assert.Equal(t, []string{"enforce:merged", "enforce:suspend", "enforce:ban"}, violationActions(t, 8)[8:])
			})

			t.Run("a warning does not shield a later refusal of another category", func(t *testing.T) {
				resetViolationGuardState()
				*operation_setting.GetViolationGuardSetting() = lenient
				now := common.GetTimestamp()
				require.NoError(t, applyViolationStrike(lenient, model.ViolationRecord{UserId: 9, Category: "reasoning_extraction", ConversationKey: refusedKey}, now))
				require.NoError(t, applyViolationStrike(lenient, model.ViolationRecord{UserId: 9, Category: "bio", ConversationKey: "another-conversation"}, now+1200))
				assert.Equal(t, []string{"enforce:warn", "enforce:suspend"}, violationActions(t, 9))
				require.NotNil(t, checkViolationGuard(t, 9, fresh))
			})

			t.Run("observe mode records the outcome and restricts no one", func(t *testing.T) {
				resetViolationGuardState()
				*operation_setting.GetViolationGuardSetting() = observe
				now := common.GetTimestamp()
				require.NoError(t, applyViolationStrike(observe, model.ViolationRecord{UserId: 2, ConversationKey: refusedKey}, now))
				assert.Nil(t, checkViolationGuard(t, 2, resent))
				require.NoError(t, applyViolationStrike(observe, model.ViolationRecord{UserId: 2, ConversationKey: "another-conversation"}, now+day+3600))
				assert.Equal(t, []string{"observe:suspend", "observe:ban"}, violationActions(t, 2))
				user, err := model.GetUserById(2, false)
				require.NoError(t, err)
				assert.Equal(t, common.UserStatusEnabled, user.Status)
			})

			t.Run("enforce mode does not count strikes recorded in observe mode", func(t *testing.T) {
				resetViolationGuardState()
				*operation_setting.GetViolationGuardSetting() = enforce
				now := common.GetTimestamp()
				require.NoError(t, applyViolationStrike(observe, model.ViolationRecord{UserId: 6, ConversationKey: refusedKey}, now))
				// Within the observe strike's merge period and after one strike:
				// neither merged nor a ban.
				require.NoError(t, applyViolationStrike(enforce, model.ViolationRecord{UserId: 6, ConversationKey: refusedKey}, now+3600))
				assert.Equal(t, []string{"observe:suspend", "enforce:suspend"}, violationActions(t, 6))
				require.NotNil(t, checkViolationGuard(t, 6, fresh))
			})

			t.Run("refused messages are kept only while strikes count", func(t *testing.T) {
				resetViolationGuardState()
				*operation_setting.GetViolationGuardSetting() = observe
				now := common.GetTimestamp()
				require.NoError(t, applyViolationStrike(observe, model.ViolationRecord{UserId: 7, ConversationKey: "old", Excerpt: "old message"}, now-31*day))
				require.NoError(t, applyViolationStrike(observe, model.ViolationRecord{UserId: 7, ConversationKey: "new", Excerpt: "new message"}, now))
				var excerpts []string
				require.NoError(t, model.DB.Model(&model.ViolationRecord{}).Where("user_id = ?", 7).Order("id").Pluck("excerpt", &excerpts).Error)
				assert.Equal(t, []string{"", "new message"}, excerpts)
			})

			t.Run("administrators are recorded but never restricted", func(t *testing.T) {
				resetViolationGuardState()
				*operation_setting.GetViolationGuardSetting() = enforce
				require.NoError(t, applyViolationStrike(enforce, model.ViolationRecord{UserId: 3, ConversationKey: refusedKey}, common.GetTimestamp()))
				assert.Equal(t, []string{"exempt:suspend"}, violationActions(t, 3))
				assert.Nil(t, checkViolationGuard(t, 3, resent))
			})

			t.Run("lifting ends the suspension and earlier strikes stop counting", func(t *testing.T) {
				resetViolationGuardState()
				*operation_setting.GetViolationGuardSetting() = enforce
				now := common.GetTimestamp()
				require.NoError(t, applyViolationStrike(enforce, model.ViolationRecord{UserId: 4, ConversationKey: refusedKey}, now))
				require.NotNil(t, checkViolationGuard(t, 4, fresh))
				require.NoError(t, ForgiveViolations(4))
				assert.Nil(t, checkViolationGuard(t, 4, resent))
				require.NoError(t, applyViolationStrike(enforce, model.ViolationRecord{UserId: 4, ConversationKey: "another-conversation"}, now+day+3600))
				assert.Equal(t, []string{"enforce:suspend", "enforce:suspend"}, violationActions(t, 4))
			})

			t.Run("a refused conversation stays blocked after the suspension", func(t *testing.T) {
				resetViolationGuardState()
				noSuspension := enforce
				noSuspension.SuspendHours = 0
				*operation_setting.GetViolationGuardSetting() = noSuspension
				require.NoError(t, applyViolationStrike(noSuspension, model.ViolationRecord{UserId: 5, ConversationKey: refusedKey}, common.GetTimestamp()))
				assert.Equal(t, []string{"enforce:strike"}, violationActions(t, 5))

				apiErr := checkViolationGuard(t, 5, resent)
				require.NotNil(t, apiErr)
				assert.Equal(t, types.ErrorCodeViolationConversationBlocked, apiErr.GetErrorCode())
				assert.Nil(t, checkViolationGuard(t, 5, fresh))

				// The guard loads refused conversations from the database after a restart.
				resetViolationGuardState()
				require.NotNil(t, checkViolationGuard(t, 5, resent))
				*operation_setting.GetViolationGuardSetting() = observe
				assert.Nil(t, checkViolationGuard(t, 5, resent))
			})
		})
	}
}
