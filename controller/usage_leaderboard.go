package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetUsageLeaderboard(c *gin.Context) {
	result, err := service.GetUsageLeaderboard(c.DefaultQuery("period", "day"), c.GetInt("id"))
	if err != nil {
		if errors.Is(err, service.ErrInvalidUsageLeaderboardPeriod) {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "invalid leaderboard period",
			})
			return
		}
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    result,
	})
}
