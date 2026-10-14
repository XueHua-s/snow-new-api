package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// MultiKeyStatusResponse represents the response for key status query
type MultiKeyStatusResponse struct {
	Keys       []KeyStatus `json:"keys"`
	Total      int         `json:"total"`
	Page       int         `json:"page"`
	PageSize   int         `json:"page_size"`
	TotalPages int         `json:"total_pages"`
	// Statistics
	EnabledCount        int `json:"enabled_count"`
	ManualDisabledCount int `json:"manual_disabled_count"`
	AutoDisabledCount   int `json:"auto_disabled_count"`
}

type KeyStatus struct {
	Index        int    `json:"index"`
	Status       int    `json:"status"` // 1: enabled, 2: disabled
	DisabledTime int64  `json:"disabled_time,omitempty"`
	Reason       string `json:"reason,omitempty"`
	KeyPreview   string `json:"key_preview"` // first 10 chars of key for identification
}

// writeMultiKeyStatus returns filtered, paginated key previews and unfiltered totals.
// The caller must hold the channel polling lock while reading key state.
func writeMultiKeyStatus(c *gin.Context, channel *model.Channel, request MultiKeyManageRequest) {
	keys := channel.GetKeys()

	// Default pagination parameters
	page := request.Page
	pageSize := request.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 50 // Default page size
	}

	// Statistics for all keys (unchanged by filtering)
	var enabledCount, manualDisabledCount, autoDisabledCount int

	// Build all key status data first
	var allKeyStatusList []KeyStatus
	for i, key := range keys {
		status := 1 // default enabled
		var disabledTime int64
		var reason string

		if channel.ChannelInfo.MultiKeyStatusList != nil {
			if s, exists := channel.ChannelInfo.MultiKeyStatusList[i]; exists {
				status = s
			}
		}

		// Count for statistics (all keys)
		switch status {
		case 1:
			enabledCount++
		case 2:
			manualDisabledCount++
		case 3:
			autoDisabledCount++
		}

		if status != 1 {
			if channel.ChannelInfo.MultiKeyDisabledTime != nil {
				disabledTime = channel.ChannelInfo.MultiKeyDisabledTime[i]
			}
			if channel.ChannelInfo.MultiKeyDisabledReason != nil {
				reason = channel.ChannelInfo.MultiKeyDisabledReason[i]
			}
		}

		// Create key preview (first 10 chars)
		keyPreview := key
		if len(key) > 10 {
			keyPreview = key[:10] + "..."
		}

		allKeyStatusList = append(allKeyStatusList, KeyStatus{
			Index:        i,
			Status:       status,
			DisabledTime: disabledTime,
			Reason:       reason,
			KeyPreview:   keyPreview,
		})
	}

	// Apply status filter if specified
	var filteredKeyStatusList []KeyStatus
	if request.Status != nil {
		for _, keyStatus := range allKeyStatusList {
			if keyStatus.Status == *request.Status {
				filteredKeyStatusList = append(filteredKeyStatusList, keyStatus)
			}
		}
	} else {
		filteredKeyStatusList = allKeyStatusList
	}

	// Calculate pagination based on filtered results
	filteredTotal := len(filteredKeyStatusList)
	totalPages := (filteredTotal + pageSize - 1) / pageSize
	if totalPages == 0 {
		totalPages = 1
	}
	if page > totalPages {
		page = totalPages
	}

	// Calculate range for current page
	start := (page - 1) * pageSize
	end := start + pageSize
	if end > filteredTotal {
		end = filteredTotal
	}

	// Get the page data
	var pageKeyStatusList []KeyStatus
	if start < filteredTotal {
		pageKeyStatusList = filteredKeyStatusList[start:end]
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": MultiKeyStatusResponse{
			Keys:                pageKeyStatusList,
			Total:               filteredTotal, // Total of filtered results
			Page:                page,
			PageSize:            pageSize,
			TotalPages:          totalPages,
			EnabledCount:        enabledCount,        // Overall statistics
			ManualDisabledCount: manualDisabledCount, // Overall statistics
			AutoDisabledCount:   autoDisabledCount,   // Overall statistics
		},
	})
	return
}
