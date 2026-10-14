package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func GetAllUsers(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	sortOptions := model.NewUserSortOptions(c.Query("sort_by"), c.Query("sort_order"))
	users, total, err := model.GetAllUsers(pageInfo, sortOptions)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(users)

	common.ApiSuccess(c, pageInfo)
	return
}

func SearchUsers(c *gin.Context) {
	keyword := c.Query("keyword")
	group := c.Query("group")
	var role *int
	if roleStr := c.Query("role"); roleStr != "" {
		if parsed, err := strconv.Atoi(roleStr); err == nil {
			role = &parsed
		}
	}
	var status *int
	if statusStr := c.Query("status"); statusStr != "" {
		if parsed, err := strconv.Atoi(statusStr); err == nil {
			status = &parsed
		}
	}
	pageInfo := common.GetPageQuery(c)
	sortOptions := model.NewUserSortOptions(c.Query("sort_by"), c.Query("sort_order"))
	users, total, err := model.SearchUsers(keyword, group, role, status, pageInfo.GetStartIdx(), pageInfo.GetPageSize(), sortOptions)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(users)
	common.ApiSuccess(c, pageInfo)
	return
}

func canManageTargetRole(myRole int, targetRole int) bool {
	return myRole == common.RoleRootUser || myRole > targetRole
}

func GetUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	myRole := c.GetInt("role")
	if !canManageTargetRole(myRole, user.Role) {
		common.ApiErrorI18n(c, i18n.MsgUserNoPermissionSameLevel)
		return
	}
	user.AdminPermissions = authz.Capabilities(user.Id, user.Role)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    user,
	})
	return
}

func UpdateUser(c *gin.Context) {
	var updatedUser model.User
	err := common.DecodeJson(c.Request.Body, &updatedUser)
	if err != nil || updatedUser.Id == 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	updatedUser.Username = strings.TrimSpace(updatedUser.Username)
	if updatedUser.Username == "" {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if updatedUser.Password == "" {
		updatedUser.Password = "$I_LOVE_U" // make Validator happy :)
	}
	if err := common.Validate.Struct(&updatedUser); err != nil {
		common.ApiErrorI18n(c, i18n.MsgUserInputInvalid, map[string]any{"Error": err.Error()})
		return
	}
	originUser, err := model.GetUserById(updatedUser.Id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if updatedUser.Role != common.RoleGuestUser && updatedUser.Role != originUser.Role {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	updatedUser.Role = originUser.Role
	myRole := c.GetInt("role")
	if !canManageTargetRole(myRole, originUser.Role) {
		common.ApiErrorI18n(c, i18n.MsgUserNoPermissionHigherLevel)
		return
	}
	if updatedUser.Password == "$I_LOVE_U" {
		updatedUser.Password = "" // rollback to what it should be
	}
	updatePassword := updatedUser.Password != ""
	authzTouched := false
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := updatedUser.EditWithTx(tx, updatePassword); err != nil {
			return err
		}
		touched, err := updateAdminPermissionsForUserInTx(c, tx, updatedUser.Id, originUser.Role, updatedUser.AdminPermissions)
		authzTouched = touched
		return err
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	if authzTouched {
		if err := authz.ReloadPolicy(); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	if updatedUser.AuthVersion > originUser.AuthVersion {
		if _, err := model.RevokeAllUserSessions(updatedUser.Id, "admin_user_update"); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	if err := model.PublishUserAuthCache(updatedUser.Id); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, updatedUser.Id, "user.update", map[string]interface{}{
		"username": originUser.Username,
		"id":       updatedUser.Id,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func DeleteUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	originUser, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	myRole := c.GetInt("role")
	if myRole <= originUser.Role {
		common.ApiErrorI18n(c, i18n.MsgUserNoPermissionHigherLevel)
		return
	}
	err = model.HardDeleteUserById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, originUser.Id, "user.delete", map[string]interface{}{
		"username": originUser.Username,
		"id":       originUser.Id,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func CreateUser(c *gin.Context) {
	var user model.User
	err := common.DecodeJson(c.Request.Body, &user)
	user.Username = strings.TrimSpace(user.Username)
	if err != nil || user.Username == "" || user.Password == "" {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if err := common.Validate.Struct(&user); err != nil {
		common.ApiErrorI18n(c, i18n.MsgUserInputInvalid, map[string]any{"Error": err.Error()})
		return
	}
	if user.DisplayName == "" {
		user.DisplayName = user.Username
	}
	myRole := c.GetInt("role")
	if user.Role >= myRole {
		common.ApiErrorI18n(c, i18n.MsgUserCannotCreateHigherLevel)
		return
	}
	// Even for admin users, we cannot fully trust them!
	cleanUser := model.User{
		Username:    user.Username,
		Password:    user.Password,
		DisplayName: user.DisplayName,
		Role:        user.Role, // 保持管理员设置的角色
	}
	authzTouched := false
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := cleanUser.InsertWithTx(tx, 0); err != nil {
			return err
		}
		touched, err := updateAdminPermissionsForUserInTx(c, tx, cleanUser.Id, cleanUser.Role, user.AdminPermissions)
		authzTouched = touched
		return err
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	if authzTouched {
		if err := authz.ReloadPolicy(); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	cleanUser.FinishInsert(0)

	recordManageAuditFor(c, cleanUser.Id, "user.create", map[string]interface{}{
		"username": cleanUser.Username,
		"role":     cleanUser.Role,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func updateAdminPermissionsForUserInTx(c *gin.Context, tx *gorm.DB, userID int, userRole int, permissions map[string]map[string]bool) (bool, error) {
	if permissions == nil {
		if userRole < common.RoleAdminUser && c.GetInt("role") == common.RoleRootUser {
			return true, authz.ClearUserAuthorizationInTx(tx, userID)
		}
		return false, nil
	}
	if c.GetInt("role") != common.RoleRootUser {
		return false, fmt.Errorf("only root can update admin permissions")
	}
	if userRole < common.RoleAdminUser {
		return true, authz.ClearUserAuthorizationInTx(tx, userID)
	}
	return true, authz.SetUserPermissionsInTx(tx, userID, permissions)
}

type ManageRequest struct {
	Id     int    `json:"id"`
	Action string `json:"action"`
	Value  int    `json:"value"`
	Mode   string `json:"mode"`
}

// ManageUser Only admin user can do this
func ManageUser(c *gin.Context) {
	var req ManageRequest
	err := common.DecodeJson(c.Request.Body, &req)

	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	user := model.User{
		Id: req.Id,
	}
	// Fill attributes
	model.DB.Unscoped().Where(&user).First(&user)
	if user.Id == 0 {
		common.ApiErrorI18n(c, i18n.MsgUserNotExists)
		return
	}
	myRole := c.GetInt("role")
	if !canManageTargetRole(myRole, user.Role) {
		common.ApiErrorI18n(c, i18n.MsgUserNoPermissionHigherLevel)
		return
	}
	switch req.Action {
	case "disable":
		user.Status = common.UserStatusDisabled
		if user.Role == common.RoleRootUser {
			common.ApiErrorI18n(c, i18n.MsgUserCannotDisableRootUser)
			return
		}
	case "enable":
		user.Status = common.UserStatusEnabled
	case "delete":
		if user.Role == common.RoleRootUser {
			common.ApiErrorI18n(c, i18n.MsgUserCannotDeleteRootUser)
			return
		}
		if err := user.Delete(); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
		// 删除用户后，强制清理 Redis 中所有该用户令牌的缓存，
		// 避免已缓存的令牌在 TTL 过期前仍能通过 TokenAuth 校验。
		if err := model.InvalidateUserTokensCache(user.Id); err != nil {
			common.SysLog(fmt.Sprintf("failed to invalidate tokens cache for user %d: %s", user.Id, err.Error()))
		}
		recordManageAuditFor(c, user.Id, "user.manage", map[string]interface{}{
			"action":   req.Action,
			"username": user.Username,
			"id":       user.Id,
		})
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "",
		})
		return
	case "promote":
		if myRole != common.RoleRootUser {
			common.ApiErrorI18n(c, i18n.MsgUserAdminCannotPromote)
			return
		}
		if user.Role >= common.RoleAdminUser {
			common.ApiErrorI18n(c, i18n.MsgUserAlreadyAdmin)
			return
		}
		user.Role = common.RoleAdminUser
	case "demote":
		if user.Role == common.RoleRootUser {
			common.ApiErrorI18n(c, i18n.MsgUserCannotDemoteRootUser)
			return
		}
		if user.Role == common.RoleCommonUser {
			common.ApiErrorI18n(c, i18n.MsgUserAlreadyCommon)
			return
		}
		user.Role = common.RoleCommonUser
	case "add_quota":
		switch req.Mode {
		case "add":
			if req.Value <= 0 {
				common.ApiErrorI18n(c, i18n.MsgUserQuotaChangeZero)
				return
			}
			if err := model.IncreaseUserQuota(user.Id, req.Value, true); err != nil {
				common.ApiError(c, err)
				return
			}
			recordManageAuditFor(c, user.Id, "user.quota_add", map[string]interface{}{
				"quota": logger.LogQuota(req.Value),
			})
		case "subtract":
			if req.Value <= 0 {
				common.ApiErrorI18n(c, i18n.MsgUserQuotaChangeZero)
				return
			}
			if err := model.DecreaseUserQuota(user.Id, req.Value, true); err != nil {
				common.ApiError(c, err)
				return
			}
			recordManageAuditFor(c, user.Id, "user.quota_subtract", map[string]interface{}{
				"quota": logger.LogQuota(req.Value),
			})
		case "override":
			oldQuota := user.Quota
			if err := model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("quota", req.Value).Error; err != nil {
				common.ApiError(c, err)
				return
			}
			recordManageAuditFor(c, user.Id, "user.quota_override", map[string]interface{}{
				"from": logger.LogQuota(oldQuota),
				"to":   logger.LogQuota(req.Value),
			})
		default:
			common.ApiErrorI18n(c, i18n.MsgInvalidParams)
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "",
		})
		return
	default:
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	if req.Action == "demote" {
		if err := model.DB.Transaction(func(tx *gorm.DB) error {
			if err := user.UpdateWithTx(tx, false); err != nil {
				return err
			}
			return authz.ClearUserAuthorizationInTx(tx, user.Id)
		}); err != nil {
			common.ApiError(c, err)
			return
		}
		if err := authz.ReloadPolicy(); err != nil {
			common.ApiError(c, err)
			return
		}
		if err := model.PublishUserAuthCache(user.Id); err != nil {
			common.ApiError(c, err)
			return
		}
		if _, err := model.RevokeAllUserSessions(user.Id, "admin_demote"); err != nil {
			common.ApiError(c, err)
			return
		}
	} else {
		if err := user.Update(false); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	// Update/UpdateWithTx has already published the new user hash and revoked
	// browser sessions exactly once. Only PAT/relay token caches still need an
	// explicit invalidation; deleting the user hash here would discard the
	// freshly published auth-version floor.
	if err := model.InvalidateUserTokensCache(user.Id); err != nil {
		common.SysLog(fmt.Sprintf("failed to invalidate tokens cache for user %d: %s", user.Id, err.Error()))
	}
	recordManageAuditFor(c, user.Id, "user.manage", map[string]interface{}{
		"action":   req.Action,
		"username": user.Username,
		"id":       user.Id,
	})
	clearUser := model.User{
		Role:   user.Role,
		Status: user.Status,
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    clearUser,
	})
	return
}
