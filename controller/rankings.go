package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetRankings(c *gin.Context) {
	offsetMinutes, err := strconv.Atoi(c.DefaultQuery("tz_offset", "0"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "invalid timezone offset",
		})
		return
	}
	result, err := service.GetRankingsSnapshot(c.DefaultQuery("period", "week"), offsetMinutes)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}
