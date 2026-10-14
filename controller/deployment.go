package controller

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/ionet"

	"github.com/gin-gonic/gin"
)

func requireDeploymentID(c *gin.Context) (string, bool) {
	deploymentID := strings.TrimSpace(c.Param("id"))
	if deploymentID == "" {
		common.ApiErrorMsg(c, "deployment ID is required")
		return "", false
	}
	return deploymentID, true
}

func mapIoNetDeployment(d ionet.Deployment) map[string]interface{} {
	var created int64
	if d.CreatedAt.IsZero() {
		created = time.Now().Unix()
	} else {
		created = d.CreatedAt.Unix()
	}

	timeRemainingHours := d.ComputeMinutesRemaining / 60
	timeRemainingMins := d.ComputeMinutesRemaining % 60
	var timeRemaining string
	if timeRemainingHours > 0 {
		timeRemaining = fmt.Sprintf("%d hour %d minutes", timeRemainingHours, timeRemainingMins)
	} else if timeRemainingMins > 0 {
		timeRemaining = fmt.Sprintf("%d minutes", timeRemainingMins)
	} else {
		timeRemaining = "completed"
	}

	hardwareInfo := fmt.Sprintf("%s %s x%d", d.BrandName, d.HardwareName, d.HardwareQuantity)

	return map[string]interface{}{
		"id":                        d.ID,
		"deployment_name":           d.Name,
		"container_name":            d.Name,
		"status":                    strings.ToLower(d.Status),
		"type":                      "Container",
		"time_remaining":            timeRemaining,
		"time_remaining_minutes":    d.ComputeMinutesRemaining,
		"hardware_info":             hardwareInfo,
		"hardware_name":             d.HardwareName,
		"brand_name":                d.BrandName,
		"hardware_quantity":         d.HardwareQuantity,
		"completed_percent":         d.CompletedPercent,
		"compute_minutes_served":    d.ComputeMinutesServed,
		"compute_minutes_remaining": d.ComputeMinutesRemaining,
		"created_at":                created,
		"updated_at":                created,
		"model_name":                "",
		"model_version":             "",
		"instance_count":            d.HardwareQuantity,
		"resource_config": map[string]interface{}{
			"cpu":    "",
			"memory": "",
			"gpu":    strconv.Itoa(d.HardwareQuantity),
		},
		"description": "",
		"provider":    "io.net",
	}
}

func computeStatusCounts(total int, deployments []ionet.Deployment) map[string]int64 {
	counts := map[string]int64{
		"all": int64(total),
	}

	for _, status := range []string{"running", "completed", "failed", "deployment requested", "termination requested", "destroyed"} {
		counts[status] = 0
	}

	for _, d := range deployments {
		status := strings.ToLower(strings.TrimSpace(d.Status))
		counts[status] = counts[status] + 1
	}

	return counts
}

func GetAllDeployments(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	status := c.Query("status")
	opts := &ionet.ListDeploymentsOptions{
		Status:    strings.ToLower(strings.TrimSpace(status)),
		Page:      pageInfo.GetPage(),
		PageSize:  pageInfo.GetPageSize(),
		SortBy:    "created_at",
		SortOrder: "desc",
	}

	dl, err := client.ListDeployments(opts)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]map[string]interface{}, 0, len(dl.Deployments))
	for _, d := range dl.Deployments {
		items = append(items, mapIoNetDeployment(d))
	}

	data := gin.H{
		"page":          pageInfo.GetPage(),
		"page_size":     pageInfo.GetPageSize(),
		"total":         dl.Total,
		"items":         items,
		"status_counts": computeStatusCounts(dl.Total, dl.Deployments),
	}
	common.ApiSuccess(c, data)
}

func SearchDeployments(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	status := strings.ToLower(strings.TrimSpace(c.Query("status")))
	keyword := strings.TrimSpace(c.Query("keyword"))

	dl, err := client.ListDeployments(&ionet.ListDeploymentsOptions{
		Status:    status,
		Page:      pageInfo.GetPage(),
		PageSize:  pageInfo.GetPageSize(),
		SortBy:    "created_at",
		SortOrder: "desc",
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}

	filtered := make([]ionet.Deployment, 0, len(dl.Deployments))
	if keyword == "" {
		filtered = dl.Deployments
	} else {
		kw := strings.ToLower(keyword)
		for _, d := range dl.Deployments {
			if strings.Contains(strings.ToLower(d.Name), kw) {
				filtered = append(filtered, d)
			}
		}
	}

	items := make([]map[string]interface{}, 0, len(filtered))
	for _, d := range filtered {
		items = append(items, mapIoNetDeployment(d))
	}

	total := dl.Total
	if keyword != "" {
		total = len(filtered)
	}

	data := gin.H{
		"page":      pageInfo.GetPage(),
		"page_size": pageInfo.GetPageSize(),
		"total":     total,
		"items":     items,
	}
	common.ApiSuccess(c, data)
}

func GetDeployment(c *gin.Context) {
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	deploymentID, ok := requireDeploymentID(c)
	if !ok {
		return
	}

	details, err := client.GetDeployment(deploymentID)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	data := map[string]interface{}{
		"id":              details.ID,
		"deployment_name": details.ID,
		"model_name":      "",
		"model_version":   "",
		"status":          strings.ToLower(details.Status),
		"instance_count":  details.TotalContainers,
		"hardware_id":     details.HardwareID,
		"resource_config": map[string]interface{}{
			"cpu":    "",
			"memory": "",
			"gpu":    strconv.Itoa(details.TotalGPUs),
		},
		"created_at":                details.CreatedAt.Unix(),
		"updated_at":                details.CreatedAt.Unix(),
		"description":               "",
		"amount_paid":               details.AmountPaid,
		"completed_percent":         details.CompletedPercent,
		"gpus_per_container":        details.GPUsPerContainer,
		"total_gpus":                details.TotalGPUs,
		"total_containers":          details.TotalContainers,
		"hardware_name":             details.HardwareName,
		"brand_name":                details.BrandName,
		"compute_minutes_served":    details.ComputeMinutesServed,
		"compute_minutes_remaining": details.ComputeMinutesRemaining,
		"locations":                 details.Locations,
		"container_config":          details.ContainerConfig,
	}

	common.ApiSuccess(c, data)
}

func UpdateDeploymentName(c *gin.Context) {
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	deploymentID, ok := requireDeploymentID(c)
	if !ok {
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	updateReq := &ionet.UpdateClusterNameRequest{
		Name: strings.TrimSpace(req.Name),
	}

	if updateReq.Name == "" {
		common.ApiErrorMsg(c, "deployment name cannot be empty")
		return
	}

	available, err := client.CheckClusterNameAvailability(updateReq.Name)
	if err != nil {
		common.ApiError(c, fmt.Errorf("failed to check name availability: %w", err))
		return
	}

	if !available {
		common.ApiErrorMsg(c, "deployment name is not available, please choose a different name")
		return
	}

	resp, err := client.UpdateClusterName(deploymentID, updateReq)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	data := gin.H{
		"status":  resp.Status,
		"message": resp.Message,
		"id":      deploymentID,
		"name":    updateReq.Name,
	}
	common.ApiSuccess(c, data)
}

func UpdateDeployment(c *gin.Context) {
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	deploymentID, ok := requireDeploymentID(c)
	if !ok {
		return
	}

	var req ionet.UpdateDeploymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	resp, err := client.UpdateDeployment(deploymentID, &req)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	data := gin.H{
		"status":        resp.Status,
		"deployment_id": resp.DeploymentID,
	}
	common.ApiSuccess(c, data)
}

func ExtendDeployment(c *gin.Context) {
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	deploymentID, ok := requireDeploymentID(c)
	if !ok {
		return
	}

	var req ionet.ExtendDurationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	details, err := client.ExtendDeployment(deploymentID, &req)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	data := mapIoNetDeployment(ionet.Deployment{
		ID:                      details.ID,
		Status:                  details.Status,
		Name:                    deploymentID,
		CompletedPercent:        float64(details.CompletedPercent),
		HardwareQuantity:        details.TotalGPUs,
		BrandName:               details.BrandName,
		HardwareName:            details.HardwareName,
		ComputeMinutesServed:    details.ComputeMinutesServed,
		ComputeMinutesRemaining: details.ComputeMinutesRemaining,
		CreatedAt:               details.CreatedAt,
	})

	common.ApiSuccess(c, data)
}

func DeleteDeployment(c *gin.Context) {
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	deploymentID, ok := requireDeploymentID(c)
	if !ok {
		return
	}

	resp, err := client.DeleteDeployment(deploymentID)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	data := gin.H{
		"status":        resp.Status,
		"deployment_id": resp.DeploymentID,
		"message":       "Deployment termination requested successfully",
	}
	common.ApiSuccess(c, data)
}

func CreateDeployment(c *gin.Context) {
	client, ok := getIoEnterpriseClient(c)
	if !ok {
		return
	}

	var req ionet.DeploymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	resp, err := client.DeployContainer(&req)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	data := gin.H{
		"deployment_id": resp.DeploymentID,
		"status":        resp.Status,
		"message":       "Deployment created successfully",
	}
	common.ApiSuccess(c, data)
}
