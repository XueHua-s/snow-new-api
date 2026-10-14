package controller

import (
	"bytes"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/ionet"

	"github.com/gin-gonic/gin"
)

func getIoAPIKey(c *gin.Context) (string, bool) {
	common.OptionMapRWMutex.RLock()
	enabled := common.OptionMap["model_deployment.ionet.enabled"] == "true"
	apiKey := common.OptionMap["model_deployment.ionet.api_key"]
	common.OptionMapRWMutex.RUnlock()
	if !enabled || strings.TrimSpace(apiKey) == "" {
		common.ApiErrorMsg(c, "io.net model deployment is not enabled or api key missing")
		return "", false
	}
	return apiKey, true
}

func GetModelDeploymentSettings(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	enabled := common.OptionMap["model_deployment.ionet.enabled"] == "true"
	hasAPIKey := strings.TrimSpace(common.OptionMap["model_deployment.ionet.api_key"]) != ""
	common.OptionMapRWMutex.RUnlock()

	common.ApiSuccess(c, gin.H{
		"provider":    "io.net",
		"enabled":     enabled,
		"configured":  hasAPIKey,
		"can_connect": enabled && hasAPIKey,
	})
}

func getIoClient(c *gin.Context) (*ionet.Client, bool) {
	apiKey, ok := getIoAPIKey(c)
	if !ok {
		return nil, false
	}
	return ionet.NewClient(apiKey), true
}

func getIoEnterpriseClient(c *gin.Context) (*ionet.Client, bool) {
	apiKey, ok := getIoAPIKey(c)
	if !ok {
		return nil, false
	}
	return ionet.NewEnterpriseClient(apiKey), true
}

func TestIoNetConnection(c *gin.Context) {
	var req struct {
		APIKey string `json:"api_key"`
	}

	rawBody, err := c.GetRawData()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(bytes.TrimSpace(rawBody)) > 0 {
		if err := common.Unmarshal(rawBody, &req); err != nil {
			common.ApiErrorMsg(c, "invalid request payload")
			return
		}
	}

	apiKey := strings.TrimSpace(req.APIKey)
	if apiKey == "" {
		common.OptionMapRWMutex.RLock()
		storedKey := strings.TrimSpace(common.OptionMap["model_deployment.ionet.api_key"])
		common.OptionMapRWMutex.RUnlock()
		if storedKey == "" {
			common.ApiErrorMsg(c, "api_key is required")
			return
		}
		apiKey = storedKey
	}

	client := ionet.NewEnterpriseClient(apiKey)
	result, err := client.GetMaxGPUsPerContainer()
	if err != nil {
		if apiErr, ok := err.(*ionet.APIError); ok {
			message := strings.TrimSpace(apiErr.Message)
			if message == "" {
				message = "failed to validate api key"
			}
			common.ApiErrorMsg(c, message)
			return
		}
		common.ApiError(c, err)
		return
	}

	totalHardware := 0
	totalAvailable := 0
	if result != nil {
		totalHardware = len(result.Hardware)
		totalAvailable = result.Total
		if totalAvailable == 0 {
			for _, hw := range result.Hardware {
				totalAvailable += hw.Available
			}
		}
	}

	common.ApiSuccess(c, gin.H{
		"hardware_count":  totalHardware,
		"total_available": totalAvailable,
	})
}

func GetHardwareTypes(c *gin.Context) {
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	hardwareTypes, totalAvailable, err := client.ListHardwareTypes()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	data := gin.H{
		"hardware_types":  hardwareTypes,
		"total":           len(hardwareTypes),
		"total_available": totalAvailable,
	}
	common.ApiSuccess(c, data)
}

func GetLocations(c *gin.Context) {
	client, ok := getIoClient(c)
	if !ok {
		return
	}

	locationsResp, err := client.ListLocations()
	if err != nil {
		common.ApiError(c, err)
		return
	}

	total := locationsResp.Total
	if total == 0 {
		total = len(locationsResp.Locations)
	}

	data := gin.H{
		"locations": locationsResp.Locations,
		"total":     total,
	}
	common.ApiSuccess(c, data)
}

func GetAvailableReplicas(c *gin.Context) {
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	hardwareIDStr := c.Query("hardware_id")
	gpuCountStr := c.Query("gpu_count")

	if hardwareIDStr == "" {
		common.ApiErrorMsg(c, "hardware_id parameter is required")
		return
	}

	hardwareID, err := strconv.Atoi(hardwareIDStr)
	if err != nil || hardwareID <= 0 {
		common.ApiErrorMsg(c, "invalid hardware_id parameter")
		return
	}

	gpuCount := 1
	if gpuCountStr != "" {
		if parsed, err := strconv.Atoi(gpuCountStr); err == nil && parsed > 0 {
			gpuCount = parsed
		}
	}

	replicas, err := client.GetAvailableReplicas(hardwareID, gpuCount)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, replicas)
}

func GetPriceEstimation(c *gin.Context) {
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	var req ionet.PriceEstimationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	priceResp, err := client.GetPriceEstimation(&req)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, priceResp)
}

func CheckClusterNameAvailability(c *gin.Context) {
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	clusterName := strings.TrimSpace(c.Query("name"))
	if clusterName == "" {
		common.ApiErrorMsg(c, "name parameter is required")
		return
	}

	available, err := client.CheckClusterNameAvailability(clusterName)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	data := gin.H{
		"available": available,
		"name":      clusterName,
	}
	common.ApiSuccess(c, data)
}
