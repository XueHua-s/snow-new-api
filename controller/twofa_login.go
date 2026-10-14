package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

type twoFALoginFlowPayload struct {
	AuthVersion int64 `json:"auth_version"`
}

// Verify2FALogin 登录时验证2FA
func Verify2FALogin(c *gin.Context) {
	var req Verify2FARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "参数错误",
		})
		return
	}

	flow, err := model.GetAuthFlow(req.FlowToken, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeTwoFALogin})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "会话已过期，请重新登录",
		})
		return
	}
	// 获取用户信息
	user, err := model.GetUserById(flow.UserId, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "用户不存在",
		})
		return
	}
	if user.Status != common.UserStatusEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "用户已被禁用",
		})
		return
	}
	var flowPayload twoFALoginFlowPayload
	if err := common.UnmarshalJsonStr(flow.Payload, &flowPayload); err != nil || flowPayload.AuthVersion <= 0 || flowPayload.AuthVersion != user.AuthVersion {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "会话已过期，请重新登录",
		})
		return
	}

	// 获取2FA记录
	twoFA, err := model.GetTwoFAByUserId(user.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if twoFA == nil || !twoFA.IsEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "用户未启用2FA",
		})
		return
	}

	// 验证TOTP验证码或备用码
	cleanCode, err := common.ValidateNumericCode(req.Code)
	isValidTOTP := false
	isValidBackup := false

	if err == nil {
		// 尝试验证TOTP
		isValidTOTP, _ = twoFA.ValidateTOTPAndUpdateUsage(cleanCode)
	}

	if !isValidTOTP {
		// 尝试验证备用码
		isValidBackup, err = twoFA.ValidateBackupCodeAndUpdateUsage(req.Code)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
	}

	if !isValidTOTP && !isValidBackup {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "验证码或备用码错误，请重试",
		})
		return
	}

	if _, err := model.ConsumeAuthFlow(req.FlowToken, model.AuthFlowMatch{
		Purpose: model.AuthFlowPurposeTwoFALogin,
		UserId:  user.Id,
	}); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "会话已过期，请重新登录",
		})
		return
	}

	setupLoginAtAuthVersion(user, flowPayload.AuthVersion, c)
}
