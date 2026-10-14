package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func channelIDsFromChannels(channels []*model.Channel) []int {
	ids := make([]int, 0, len(channels))
	for _, channel := range channels {
		if channel != nil && channel.Id > 0 {
			ids = append(ids, channel.Id)
		}
	}
	return ids
}

func closeActiveChannelWebSockets(channelIDs []int) {
	service.CloseActiveWebSocketsForChannels(channelIDs, service.ChannelDisabledCloseReason)
}

func hasEnabledMultiKey(channel *model.Channel) bool {
	if channel == nil || !channel.ChannelInfo.IsMultiKey {
		return true
	}
	keys := channel.GetKeys()
	if len(keys) == 0 {
		return false
	}
	for i := range keys {
		if channel.ChannelInfo.MultiKeyStatusList == nil {
			return true
		}
		if status, ok := channel.ChannelInfo.MultiKeyStatusList[i]; !ok || status == common.ChannelStatusEnabled {
			return true
		}
	}
	return false
}

func disableMultiKeyChannelIfUnavailable(channel *model.Channel) bool {
	if channel == nil || !channel.ChannelInfo.IsMultiKey || hasEnabledMultiKey(channel) {
		return false
	}
	if channel.Status != common.ChannelStatusEnabled {
		return true
	}
	channel.Status = common.ChannelStatusManuallyDisabled
	info := channel.GetOtherInfo()
	info["status_reason"] = model.ChannelStatusReasonAllKeysDisabled
	info["status_time"] = common.GetTimestamp()
	channel.SetOtherInfo(info)
	return true
}

func restoreMultiKeyChannelIfAvailable(channel *model.Channel) {
	if channel.Status != common.ChannelStatusManuallyDisabled || !hasEnabledMultiKey(channel) {
		return
	}
	info := channel.GetOtherInfo()
	if info["status_reason"] != model.ChannelStatusReasonAllKeysDisabled {
		return
	}
	channel.Status = common.ChannelStatusEnabled
	info["status_reason"] = ""
	info["status_time"] = common.GetTimestamp()
	channel.SetOtherInfo(info)
}

func FixChannelsAbilities(c *gin.Context) {
	success, fails, err := model.FixAbility()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"success": success,
			"fails":   fails,
		},
	})
}

type ChannelStatusRequest struct {
	Status int `json:"status"`
}

type ChannelStatusBatchRequest struct {
	Ids    []int `json:"ids"`
	Status int   `json:"status"`
}

func UpdateChannelStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	req := ChannelStatusRequest{}
	if err := c.ShouldBindJSON(&req); err != nil || !isManageableChannelStatus(req.Status) {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	changed := model.UpdateChannelStatus(id, "", req.Status, "manual operation")
	if changed {
		model.InitChannelCache()
		if req.Status != common.ChannelStatusEnabled {
			closeActiveChannelWebSockets([]int{id})
		}
	}
	recordManageAudit(c, "channel.status_update", map[string]interface{}{
		"id":      id,
		"status":  req.Status,
		"changed": changed,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    changed,
	})
}

func BatchUpdateChannelStatus(c *gin.Context) {
	req := ChannelStatusBatchRequest{}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Ids) == 0 || !isManageableChannelStatus(req.Status) {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	changedCount := 0
	var disabledIDs []int
	for _, id := range req.Ids {
		if model.UpdateChannelStatus(id, "", req.Status, "manual batch operation") {
			changedCount++
			if req.Status != common.ChannelStatusEnabled {
				disabledIDs = append(disabledIDs, id)
			}
		}
	}
	if changedCount > 0 {
		model.InitChannelCache()
	}
	if len(disabledIDs) > 0 {
		closeActiveChannelWebSockets(disabledIDs)
	}
	recordManageAudit(c, "channel.status_update_batch", map[string]any{
		"count":  changedCount,
		"total":  len(req.Ids),
		"status": req.Status,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    changedCount,
	})
}

func isManageableChannelStatus(status int) bool {
	return status == common.ChannelStatusEnabled || status == common.ChannelStatusManuallyDisabled
}
