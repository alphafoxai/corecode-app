package middleware

import (
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// PowCheck requires a solved proof-of-work challenge in X-Pow-Solution while
// PowCheckEnabled is on. Each solution passes once, so every attempt, failed
// sign-ins included, costs the client a new solve.
func PowCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !common.PowCheckEnabled {
			c.Next()
			return
		}
		raw := strings.TrimSpace(c.GetHeader("X-Pow-Solution"))
		if raw == "" {
			common.ApiErrorT(c, "Browser check is missing, please refresh the page and try again")
			c.Abort()
			return
		}
		err := service.ConsumePowSolution(c.Request.Context(), raw, time.Now())
		if err != nil {
			if !errors.Is(err, service.ErrPowSolutionInvalid) && !errors.Is(err, service.ErrPowSolutionExpired) && !errors.Is(err, service.ErrPowSolutionUsed) {
				common.SysError(common.LogText("proof-of-work check failed: %s", err.Error()))
			}
			common.ApiErrorT(c, "Browser check failed or expired, please try again")
			c.Abort()
			return
		}
		c.Next()
	}
}
