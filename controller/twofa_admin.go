package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// Admin2FAStats 管理员获取2FA统计信息
func Admin2FAStats(c *gin.Context) {
	stats, err := model.GetTwoFAStats()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    stats,
	})
}

// AdminDisable2FA 管理员强制禁用用户2FA
func AdminDisable2FA(c *gin.Context) {
	userIdStr := c.Param("id")
	userId, err := strconv.Atoi(userIdStr)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "用户ID格式错误",
		})
		return
	}

	// 检查目标用户权限
	targetUser, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	myRole := c.GetInt("role")
	if !canManageTargetRole(myRole, targetUser.Role) {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "无权操作同级或更高级用户的2FA设置",
		})
		return
	}

	// 禁用2FA
	if err := model.DisableTwoFAWithAuthVersion(userId); err != nil {
		if errors.Is(err, model.ErrTwoFANotEnabled) {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "用户未启用2FA",
			})
			return
		}
		common.ApiError(c, err)
		return
	}
	if _, err := model.RevokeAllUserSessions(userId, "admin_twofa_disabled"); err != nil {
		common.ApiError(c, err)
		return
	}

	recordManageAuditFor(c, userId, "user.2fa_disable", nil)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "用户2FA已被强制禁用",
	})
}
