package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/authz"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var (
	errUserPasswordUnset    = errors.New("user password is not set")
	errOriginalPasswordFail = errors.New("original password is incorrect")
)

func GetSelf(c *gin.Context) {
	id := c.GetInt("id")
	userRole := c.GetInt("role")
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	responseData := buildSelfUserData(user)
	// The authenticated role is loaded from GetUserCache. It should equal the
	// row role, but use it for capabilities so GetSelf and login/refresh remain
	// consistent with the authorization decision made for this request.
	permissions := calculateUserPermissions(userRole)
	permissions["admin_permissions"] = authz.Capabilities(id, userRole)
	responseData["permissions"] = permissions

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    responseData,
	})
	return
}

// buildSelfUserData is the single safe dashboard-user DTO used by GetSelf,
// login and refresh. It intentionally excludes password, management PAT and
// administrator-only remarks.
func buildSelfUserData(user *model.User) map[string]interface{} {
	userSetting := user.GetSetting()
	permissions := calculateUserPermissions(user.Role)
	permissions["admin_permissions"] = authz.Capabilities(user.Id, user.Role)
	return map[string]interface{}{
		"id":                user.Id,
		"username":          user.Username,
		"display_name":      user.DisplayName,
		"role":              user.Role,
		"status":            user.Status,
		"email":             user.Email,
		"github_id":         user.GitHubId,
		"discord_id":        user.DiscordId,
		"oidc_id":           user.OidcId,
		"wechat_id":         user.WeChatId,
		"telegram_id":       user.TelegramId,
		"group":             user.Group,
		"quota":             user.Quota,
		"used_quota":        user.UsedQuota,
		"request_count":     user.RequestCount,
		"aff_code":          user.AffCode,
		"aff_count":         user.AffCount,
		"aff_quota":         user.AffQuota,
		"aff_history_quota": user.AffHistoryQuota,
		"inviter_id":        user.InviterId,
		"linux_do_id":       user.LinuxDOId,
		"setting":           user.Setting,
		"stripe_customer":   user.StripeCustomer,
		"sidebar_modules":   userSetting.SidebarModules, // 正确提取sidebar_modules字段
		"permissions":       permissions,
	}
}

// 计算用户权限的辅助函数
func calculateUserPermissions(userRole int) map[string]interface{} {
	permissions := map[string]interface{}{}

	// 根据用户角色计算权限
	if userRole == common.RoleRootUser {
		// 超级管理员不需要边栏设置功能
		permissions["sidebar_settings"] = false
		permissions["sidebar_modules"] = map[string]interface{}{}
	} else if userRole == common.RoleAdminUser {
		// 管理员可以设置边栏，但不包含系统设置功能
		permissions["sidebar_settings"] = true
		permissions["sidebar_modules"] = map[string]interface{}{
			"admin": map[string]interface{}{
				"setting": false, // 管理员不能访问系统设置
			},
		}
	} else {
		// 普通用户只能设置个人功能，不包含管理员区域
		permissions["sidebar_settings"] = true
		permissions["sidebar_modules"] = map[string]interface{}{
			"admin": false, // 普通用户不能访问管理员区域
		}
	}

	return permissions
}

func GetUserModels(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		id = c.GetInt("id")
	}
	user, err := model.GetUserCache(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	groups := service.GetUserUsableGroups(user.Group)
	group := c.Query("group")
	var groupsToQuery []string
	switch {
	case group == "":
		for g := range groups {
			groupsToQuery = append(groupsToQuery, g)
		}
	case group == "auto":
		if _, ok := groups[group]; ok {
			groupsToQuery = service.GetUserAutoGroup(user.Group)
		}
	default:
		if _, ok := groups[group]; ok {
			groupsToQuery = []string{group}
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    service.GetGroupsEnabledModels(groupsToQuery),
	})
}

func UpdateSelf(c *gin.Context) {
	var requestData map[string]interface{}
	if err := common.DecodeJson(c.Request.Body, &requestData); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	// 检查是否是用户设置更新请求 (sidebar_modules 或 language)
	if sidebarModules, sidebarExists := requestData["sidebar_modules"]; sidebarExists {
		userId := c.GetInt("id")
		user, err := model.GetUserById(userId, false)
		if err != nil {
			common.ApiError(c, err)
			return
		}

		// 获取当前用户设置
		currentSetting := user.GetSetting()

		// 更新sidebar_modules字段
		if sidebarModulesStr, ok := sidebarModules.(string); ok {
			currentSetting.SidebarModules = sidebarModulesStr
		}

		if err := model.UpdateUserSetting(user.Id, currentSetting); err != nil {
			common.ApiErrorI18n(c, i18n.MsgUpdateFailed)
			return
		}

		common.ApiSuccessI18n(c, i18n.MsgUpdateSuccess, nil)
		return
	}

	// 检查是否是语言偏好更新请求
	if language, langExists := requestData["language"]; langExists {
		userId := c.GetInt("id")
		user, err := model.GetUserById(userId, false)
		if err != nil {
			common.ApiError(c, err)
			return
		}

		// 获取当前用户设置
		currentSetting := user.GetSetting()

		// 更新language字段
		if langStr, ok := language.(string); ok {
			currentSetting.Language = langStr
		}

		if err := model.UpdateUserSetting(user.Id, currentSetting); err != nil {
			common.ApiErrorI18n(c, i18n.MsgUpdateFailed)
			return
		}

		common.ApiSuccessI18n(c, i18n.MsgUpdateSuccess, nil)
		return
	}

	// 原有的用户信息更新逻辑
	var user model.User
	requestDataBytes, err := common.Marshal(requestData)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if err = common.Unmarshal(requestDataBytes, &user); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	if user.Password == "" {
		user.Password = "$I_LOVE_U" // make Validator happy :)
	}
	if err := common.Validate.Struct(&user); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidInput)
		return
	}

	cleanUser := model.User{
		Id:          c.GetInt("id"),
		Username:    user.Username,
		Password:    user.Password,
		DisplayName: user.DisplayName,
	}
	if user.Password == "$I_LOVE_U" {
		user.Password = "" // rollback to what it should be
		cleanUser.Password = ""
	}
	updatePassword, err := checkUpdatePassword(user.OriginalPassword, user.Password, cleanUser.Id)
	if err != nil {
		if errors.Is(err, errUserPasswordUnset) {
			common.ApiErrorI18n(c, i18n.MsgUserPasswordUnset)
			return
		}
		if errors.Is(err, errOriginalPasswordFail) {
			common.ApiErrorI18n(c, i18n.MsgUserOriginalPasswordError)
			return
		}
		common.ApiError(c, err)
		return
	}
	if updatePassword {
		identity, ok := middleware.GetSessionAuthIdentity(c)
		if !ok {
			common.ApiError(c, errors.New("当前认证方式不支持安全验证"))
			return
		}
		if err := model.DB.Transaction(func(tx *gorm.DB) error {
			return cleanUser.UpdateWithTx(tx, true)
		}); err != nil {
			common.ApiError(c, err)
			return
		}
		if err := model.PublishUserAuthCache(cleanUser.Id); err != nil {
			common.ApiError(c, err)
			return
		}
		bundle, err := service.AdvanceCurrentSessionToUserVersion(identity, "password_changed")
		if err != nil {
			common.ApiError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "",
			"data": gin.H{
				"access_token":      bundle.AccessToken,
				"token_type":        bundle.TokenType,
				"access_expires_at": bundle.AccessExpiresAt,
				"session":           bundle.Session,
			},
		})
		return
	}
	if err := cleanUser.Update(false); err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
	return
}

func checkUpdatePassword(originalPassword string, newPassword string, userId int) (updatePassword bool, err error) {
	if newPassword == "" {
		return
	}
	var currentUser *model.User
	currentUser, err = model.GetUserById(userId, true)
	if err != nil {
		return
	}

	// 密码不为空,需要验证原密码
	if currentUser.Password == "" {
		err = errUserPasswordUnset
		return
	}
	if !common.ValidatePasswordAndHash(originalPassword, currentUser.Password) {
		err = errOriginalPasswordFail
		return
	}
	updatePassword = true
	return
}

func DeleteSelf(c *gin.Context) {
	id := c.GetInt("id")
	user, _ := model.GetUserById(id, false)

	if user.Role == common.RoleRootUser {
		common.ApiErrorI18n(c, i18n.MsgUserCannotDeleteRootUser)
		return
	}

	err := model.DeleteUserById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func GenerateAccessToken(c *gin.Context) {
	id := c.GetInt("id")
	// get rand int 28-32
	randI := common.GetRandomInt(4)
	key, err := common.GenerateRandomKey(29 + randI)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgGenerateFailed)
		common.SysLog("failed to generate key: " + err.Error())
		return
	}
	if model.DB.Where("access_token = ?", key).First(&model.User{}).RowsAffected != 0 {
		common.ApiErrorI18n(c, i18n.MsgUuidDuplicate)
		return
	}

	if err := model.UpdateUserAccessToken(id, key); err != nil {
		common.ApiError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    key,
	})
	return
}
