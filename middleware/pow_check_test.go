package middleware

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func solvedPowHeader(t *testing.T) string {
	t.Helper()
	challenge, err := service.NewPowChallenge(time.Now(), service.PowMinMaxNumber)
	require.NoError(t, err)
	for number := 0; number <= challenge.MaxNumber; number++ {
		sum := sha256.Sum256([]byte(challenge.Salt + strconv.Itoa(number)))
		if hex.EncodeToString(sum[:]) != challenge.Challenge {
			continue
		}
		data, err := common.Marshal(map[string]any{
			"salt": challenge.Salt, "challenge": challenge.Challenge, "number": number, "signature": challenge.Signature,
		})
		require.NoError(t, err)
		return base64.StdEncoding.EncodeToString(data)
	}
	t.Fatal("challenge has no solution")
	return ""
}

func TestPowCheckPassesEachSolutionOnce(t *testing.T) {
	gin.SetMode(gin.TestMode)
	enabled, redisEnabled := common.PowCheckEnabled, common.RedisEnabled
	common.PowCheckEnabled, common.RedisEnabled = true, false
	t.Cleanup(func() { common.PowCheckEnabled, common.RedisEnabled = enabled, redisEnabled })

	engine := gin.New()
	engine.POST("/guarded", PowCheck(), func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"success": true}) })
	call := func(header string) map[string]any {
		req := httptest.NewRequest(http.MethodPost, "/guarded", nil)
		if header != "" {
			req.Header.Set("X-Pow-Solution", header)
		}
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		var body map[string]any
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &body))
		return body
	}

	assert.Equal(t, "Browser check is missing, please refresh the page and try again", call("")["message"])
	assert.Equal(t, "Browser check failed or expired, please try again", call("bm9wZQ==")["message"])

	header := solvedPowHeader(t)
	assert.Equal(t, true, call(header)["success"])
	assert.Equal(t, "Browser check failed or expired, please try again", call(header)["message"])

	common.PowCheckEnabled = false
	assert.Equal(t, true, call("")["success"])
}
