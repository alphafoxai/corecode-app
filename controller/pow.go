package controller

import (
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// GetPowChallenge issues a proof-of-work challenge for the anonymous account
// routes. It answers whether or not the check is on, so a console that read
// an older status can still get one.
func GetPowChallenge(c *gin.Context) {
	challenge, err := service.NewPowChallenge(time.Now(), common.PowMaxNumber)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, challenge)
}
