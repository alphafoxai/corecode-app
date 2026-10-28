package router

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListModelsSupportsOpenAIAndGeminiAuthentication(t *testing.T) {
	setupRelayRouterTestDB(t)

	user := model.User{
		Username: "models-user",
		Status:   common.UserStatusEnabled,
		Group:    "default",
		Quota:    100,
	}
	require.NoError(t, model.DB.Create(&user).Error)
	require.NoError(t, model.DB.Create(&model.Token{
		UserId:         user.Id,
		Key:            "modelstestkey",
		Status:         common.TokenStatusEnabled,
		ExpiredTime:    -1,
		UnlimitedQuota: true,
	}).Error)

	engine := gin.New()
	SetRelayRouter(engine)

	tests := []struct {
		name           string
		path           string
		headerName     string
		expectedObject string
		expectedField  string
	}{
		{
			name:           "OpenAI bearer token",
			path:           "/v1/models",
			headerName:     "Authorization",
			expectedObject: "list",
			expectedField:  "data",
		},
		{
			name:          "Gemini API key header",
			path:          "/v1/models",
			headerName:    "x-goog-api-key",
			expectedField: "models",
		},
		{
			name:          "Gemini API key query",
			path:          "/v1/models?key=modelstestkey",
			expectedField: "models",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, test.path, nil)
			if test.headerName != "" {
				value := "modelstestkey"
				if test.headerName == "Authorization" {
					value = "Bearer " + value
				}
				request.Header.Set(test.headerName, value)
			}

			engine.ServeHTTP(recorder, request)

			require.Equal(t, http.StatusOK, recorder.Code)
			var payload map[string]any
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
			assert.Contains(t, payload, test.expectedField)
			assert.NotContains(t, payload, "error")
			if test.expectedObject != "" {
				assert.Equal(t, test.expectedObject, payload["object"])
			}
		})
	}
}

func TestListModelsWithoutKeyServesThePublicPricingModels(t *testing.T) {
	setupRelayRouterTestDB(t)
	model.InvalidatePricingCache()
	t.Cleanup(model.InvalidatePricingCache)
	originalModelRatio := ratio_setting.ModelRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"claude-3-5-haiku-20241022":0.5,"gpt-4o-mini":0.075,"gpt-4o":1.25}`))
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(originalModelRatio)) })

	require.NoError(t, model.DB.Create(&[]model.Channel{
		{Id: 1, Type: constant.ChannelTypeAnthropic, Name: "claude", Key: "k", Status: common.ChannelStatusEnabled},
		{Id: 2, Type: constant.ChannelTypeOpenAI, Name: "openai", Key: "k", Status: common.ChannelStatusEnabled},
	}).Error)
	require.NoError(t, model.DB.Create(&[]model.Ability{
		{Group: "default", Model: "claude-3-5-haiku-20241022", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "gpt-4o-mini", ChannelId: 2, Enabled: true},
		// Not a group UserUsableGroups offers, so the pricing page hides it.
		{Group: "internal", Model: "gpt-4o", ChannelId: 2, Enabled: true},
	}).Error)

	engine := gin.New()
	SetRelayRouter(engine)

	listModels := func(headers map[string]string) (int, map[string]any) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
		for name, value := range headers {
			request.Header.Set(name, value)
		}
		engine.ServeHTTP(recorder, request)
		var payload map[string]any
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
		return recorder.Code, payload
	}
	modelIDs := func(payload map[string]any) []string {
		ids := []string{}
		for _, item := range payload["data"].([]any) {
			ids = append(ids, item.(map[string]any)["id"].(string))
		}
		return ids
	}

	// Magpie sends the Anthropic headers with the key still blank.
	for _, headers := range []map[string]string{
		{"anthropic-version": "2023-06-01"},
		{"anthropic-version": "2023-06-01", "x-api-key": " "},
	} {
		code, payload := listModels(headers)
		require.Equal(t, http.StatusOK, code)
		assert.Equal(t, []string{"claude-3-5-haiku-20241022"}, modelIDs(payload))
		assert.Equal(t, "model", payload["data"].([]any)[0].(map[string]any)["type"])
		assert.Equal(t, false, payload["has_more"])
	}

	code, payload := listModels(map[string]string{"Authorization": "Bearer"})
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, "list", payload["object"])
	assert.Equal(t, []string{"claude-3-5-haiku-20241022", "gpt-4o-mini"}, modelIDs(payload))

	code, _ = listModels(map[string]string{"x-api-key": "not-a-key", "anthropic-version": "2023-06-01"})
	assert.Equal(t, http.StatusUnauthorized, code)

	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	originalHeaderNav, hadHeaderNav := common.OptionMap["HeaderNavModules"]
	common.OptionMap["HeaderNavModules"] = `{"pricing":{"enabled":true,"requireAuth":true}}`
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		defer common.OptionMapRWMutex.Unlock()
		if hadHeaderNav {
			common.OptionMap["HeaderNavModules"] = originalHeaderNav
		} else {
			delete(common.OptionMap, "HeaderNavModules")
		}
	})
	code, _ = listModels(map[string]string{"anthropic-version": "2023-06-01"})
	assert.Equal(t, http.StatusUnauthorized, code, "a pricing page behind sign-in keeps the model list behind a key")
}

func setupRelayRouterTestDB(t *testing.T) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	originalIsMasterNode := common.IsMasterNode
	originalRedisEnabled := common.RedisEnabled
	originalSQLitePath := common.SQLitePath
	originalMainDatabaseType := common.MainDatabaseType()
	originalLogDatabaseType := common.LogDatabaseType()
	originalSQLDSN, hadSQLDSN := os.LookupEnv("SQL_DSN")

	common.IsMasterNode = false
	common.RedisEnabled = false
	common.SQLitePath = fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, os.Setenv("SQL_DSN", "local"))
	require.NoError(t, model.InitDB())
	model.LOG_DB = model.DB
	require.NoError(t, model.DB.AutoMigrate(&model.User{}, &model.Token{}, &model.Ability{}, &model.Channel{}, &model.Model{}, &model.Vendor{}))

	t.Cleanup(func() {
		if sqlDB, err := model.DB.DB(); err == nil {
			_ = sqlDB.Close()
		}
		common.IsMasterNode = originalIsMasterNode
		common.RedisEnabled = originalRedisEnabled
		common.SQLitePath = originalSQLitePath
		common.SetDatabaseTypes(originalMainDatabaseType, originalLogDatabaseType)
		if hadSQLDSN {
			require.NoError(t, os.Setenv("SQL_DSN", originalSQLDSN))
		} else {
			require.NoError(t, os.Unsetenv("SQL_DSN"))
		}
	})
}
