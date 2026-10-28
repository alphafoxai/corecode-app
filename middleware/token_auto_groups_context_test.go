package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTokenAutoGroupsContext() *gin.Context {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	return ctx
}

func TestSetupContextForTokenIgnoresStoredAutoGroups(t *testing.T) {
	for _, stored := range []string{`["vip","default"]`, `[]`, `not-json`} {
		t.Run(stored, func(t *testing.T) {
			ctx := newTokenAutoGroupsContext()
			token := &model.Token{Id: 1, UserId: 2, AutoGroups: stored}

			require.NoError(t, SetupContextForToken(ctx, token))
			_, ok := common.GetContextKey(ctx, constant.ContextKeyTokenAutoGroups)
			assert.False(t, ok, "an Auto token follows the operator's AutoGroups order")
		})
	}
}
