package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func DeleteChannel(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	channelName := ""
	channelProxy := ""
	channelLookupFailed := false
	if existing, err := model.GetChannelById(id, false); err == nil && existing != nil {
		channelName = existing.Name
		channelProxy = existing.GetSetting().Proxy
	} else {
		channelLookupFailed = true
	}
	channel := model.Channel{Id: id}
	err := channel.Delete()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InitChannelCache()
	if channelLookupFailed {
		service.ResetProxyClientCache()
	} else {
		service.InvalidateProxyClient(channelProxy)
	}
	recordManageAudit(c, "channel.delete", map[string]interface{}{
		"id":   id,
		"name": channelName,
	})
	closeActiveChannelWebSockets([]int{id})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func DeleteDisabledChannel(c *gin.Context) {
	var ids []int
	if err := model.DB.Model(&model.Channel{}).
		Where("status = ? or status = ?", common.ChannelStatusAutoDisabled, common.ChannelStatusManuallyDisabled).
		Pluck("id", &ids).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	rows, err := model.DeleteDisabledChannel()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InitChannelCache()
	if rows > 0 {
		service.ResetProxyClientCache()
	}
	recordManageAudit(c, "channel.delete_disabled", map[string]interface{}{
		"count": rows,
	})
	closeActiveChannelWebSockets(ids)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    rows,
	})
	return
}

func DeleteChannelBatch(c *gin.Context) {
	channelBatch := ChannelBatch{}
	err := c.ShouldBindJSON(&channelBatch)
	if err != nil || len(channelBatch.Ids) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "参数错误",
		})
		return
	}
	deletedCount, err := model.BatchDeleteChannels(channelBatch.Ids)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.InitChannelCache()
	if deletedCount > 0 {
		service.ResetProxyClientCache()
	}
	recordManageAudit(c, "channel.delete_batch", map[string]interface{}{
		"count": deletedCount,
	})
	closeActiveChannelWebSockets(channelBatch.Ids)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    deletedCount,
	})
	return
}
