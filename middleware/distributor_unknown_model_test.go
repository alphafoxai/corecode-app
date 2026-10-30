package middleware

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A model no channel lists is answered on /v1/messages the way Anthropic
// answers it, so Claude Code falls back at once instead of retrying a 503.
func TestDistributeAnswersUnlistedClaudeModelWithNotFound(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousDB, previousMain, previousLog := model.DB, common.MainDatabaseType(), common.LogDatabaseType()
	previousPath, previousMaster := common.SQLitePath, common.IsMasterNode
	previousCache, previousRedis := common.MemoryCacheEnabled, common.RedisEnabled
	common.SQLitePath, common.IsMasterNode, common.RedisEnabled = t.TempDir()+"/unknown-model.db", false, false
	t.Setenv("SQL_DSN", "")
	require.NoError(t, model.InitDB())
	database := model.DB
	require.NoError(t, database.AutoMigrate(&model.Channel{}, &model.Ability{}))
	t.Cleanup(func() {
		model.DB = previousDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.SQLitePath, common.IsMasterNode = previousPath, previousMaster
		common.MemoryCacheEnabled, common.RedisEnabled = previousCache, previousRedis
		if previousDB != nil {
			model.InitChannelCache()
		}
		sqlDB, err := database.DB()
		require.NoError(t, err)
		require.NoError(t, sqlDB.Close())
	})

	const group = "unknown-model-test"
	for _, channel := range []*model.Channel{
		{Type: constant.ChannelTypeAnthropic, Status: common.ChannelStatusEnabled, Name: "served", Key: "served-key", Group: group, Models: "claude-opus-5-5"},
		{Type: constant.ChannelTypeAnthropic, Status: common.ChannelStatusAutoDisabled, Name: "down", Key: "down-key", Group: group, Models: "claude-haiku-5-5"},
	} {
		require.NoError(t, channel.Insert())
	}

	for _, memoryCache := range []bool{false, true} {
		common.MemoryCacheEnabled = memoryCache
		model.InitChannelCache()
		for _, tc := range []struct {
			name, path, model string
			wantStatus        int
			wantBody          string
		}{
			{name: "unlisted model on messages", path: "/v1/messages", model: "claude-sonnet-5", wantStatus: http.StatusNotFound,
				wantBody: `{"type":"error","error":{"type":"not_found_error","message":"model: claude-sonnet-5 (request id: %s)"}}`},
			{name: "listed model with every channel down", path: "/v1/messages", model: "claude-haiku-5-5", wantStatus: http.StatusServiceUnavailable},
			{name: "unlisted model on chat completions", path: "/v1/chat/completions", model: "claude-sonnet-5", wantStatus: http.StatusServiceUnavailable},
			{name: "served model", path: "/v1/messages", model: "claude-opus-5-5", wantStatus: http.StatusNoContent},
		} {
			t.Run(fmt.Sprintf("memory_cache=%t/%s", memoryCache, tc.name), func(t *testing.T) {
				router := gin.New()
				router.POST(tc.path, RequestId(), func(c *gin.Context) {
					common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
				}, Distribute(), func(c *gin.Context) {
					c.Status(http.StatusNoContent)
				})
				body := []byte(fmt.Sprintf(`{"model":%q,"max_tokens":16,"messages":[{"role":"user","content":"hi"}]}`, tc.model))
				request := httptest.NewRequest(http.MethodPost, tc.path, bytes.NewReader(body))
				request.Header.Set("Content-Type", "application/json")
				recorder := httptest.NewRecorder()
				router.ServeHTTP(recorder, request)

				require.Equal(t, tc.wantStatus, recorder.Code, recorder.Body.String())
				switch tc.wantStatus {
				case http.StatusNotFound:
					assert.JSONEq(t, fmt.Sprintf(tc.wantBody, recorder.Header().Get(common.RequestIdKey)), recorder.Body.String())
				case http.StatusServiceUnavailable:
					assert.Contains(t, recorder.Body.String(), `"code":"model_not_found"`)
				}
			})
		}
	}
}
