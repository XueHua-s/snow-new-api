package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestManageMultiKeysStatusPreservesQueryContract(t *testing.T) {
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	previousRedis, previousCache := common.RedisEnabled, common.MemoryCacheEnabled
	previousGinMode := gin.Mode()
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousType, previousLogType)
		common.RedisEnabled, common.MemoryCacheEnabled = previousRedis, previousCache
		gin.SetMode(previousGinMode)
	})
	db := setupModelListControllerTestDB(t)
	common.MemoryCacheEnabled = false
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	channel := &model.Channel{
		Name: "status-query", Type: 1, Key: "enabled-key-secret\nmanual-key-secret\nauto-key-secret",
		Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{
			IsMultiKey: true, MultiKeySize: 3,
			MultiKeyStatusList:     map[int]int{1: 2, 2: 3},
			MultiKeyDisabledTime:   map[int]int64{1: 100, 2: 200},
			MultiKeyDisabledReason: map[int]string{1: "manual", 2: "upstream failure"},
		},
	}
	require.NoError(t, db.Create(channel).Error)
	enabled := KeyStatus{Index: 0, Status: 1, KeyPreview: "enabled-ke..."}
	manual := KeyStatus{Index: 1, Status: 2, DisabledTime: 100, Reason: "manual", KeyPreview: "manual-key..."}
	auto := KeyStatus{Index: 2, Status: 3, DisabledTime: 200, Reason: "upstream failure", KeyPreview: "auto-key-s..."}

	for _, tc := range []struct {
		name     string
		request  MultiKeyManageRequest
		keys     []KeyStatus
		total    int
		page     int
		pageSize int
		pages    int
	}{
		{name: "default pagination includes all statuses", keys: []KeyStatus{enabled, manual, auto}, total: 3, page: 1, pageSize: 50, pages: 1},
		{name: "filter retains original index and global totals", request: MultiKeyManageRequest{Status: common.GetPointer(3)}, keys: []KeyStatus{auto}, total: 1, page: 1, pageSize: 50, pages: 1},
		{name: "out of range page clamps to final page", request: MultiKeyManageRequest{Page: 99, PageSize: 2}, keys: []KeyStatus{auto}, total: 3, page: 2, pageSize: 2, pages: 2},
		{name: "unmatched filter preserves empty response shape", request: MultiKeyManageRequest{Status: common.GetPointer(99)}, page: 1, pageSize: 50, pages: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := tc.request
			request.ChannelId, request.Action = channel.Id, "get_key_status"
			body, err := common.Marshal(request)
			require.NoError(t, err)
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodPost, "/api/channel/multi_key", bytes.NewReader(body))
			ctx.Request.Header.Set("Content-Type", "application/json")

			ManageMultiKeys(ctx)

			require.Equal(t, http.StatusOK, recorder.Code)
			var response struct {
				Success bool                   `json:"success"`
				Data    MultiKeyStatusResponse `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			require.True(t, response.Success)
			assert.Equal(t, MultiKeyStatusResponse{
				Keys: tc.keys, Total: tc.total, Page: tc.page, PageSize: tc.pageSize, TotalPages: tc.pages,
				EnabledCount: 1, ManualDisabledCount: 1, AutoDisabledCount: 1,
			}, response.Data)
			assert.NotContains(t, recorder.Body.String(), "-secret")
			var auditCount int64
			require.NoError(t, db.Model(&model.Log{}).Count(&auditCount).Error)
			assert.Zero(t, auditCount, "read-only key status queries must not create mutation audit logs")
			stored, err := model.GetChannelById(channel.Id, true)
			require.NoError(t, err)
			assert.Equal(t, channel.Key, stored.Key)
			assert.Equal(t, channel.ChannelInfo, stored.ChannelInfo)
		})
	}
}
