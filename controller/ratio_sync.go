package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/billing_setting"

	"github.com/gin-gonic/gin"
)

const (
	defaultTimeoutSeconds       = 10
	defaultEndpoint             = "/api/pricing"
	maxConcurrentFetches        = 8
	maxRatioConfigBytes         = 10 << 20 // 10MB
	floatEpsilon                = 1e-9
	officialRatioPresetID       = -100
	officialRatioPresetName     = "官方倍率预设"
	officialRatioPresetBaseURL  = "https://basellm.github.io"
	modelsDevPresetID           = -101
	modelsDevPresetName         = "models.dev 价格预设"
	modelsDevPresetBaseURL      = "https://models.dev"
	modelsDevHost               = "models.dev"
	modelsDevPath               = "/api.json"
	modelsDevInputCostRatioBase = 1000.0
)

type upstreamResult struct {
	Name string         `json:"name"`
	Data map[string]any `json:"data,omitempty"`
	Err  string         `json:"err,omitempty"`
}

func FetchUpstreamRatios(c *gin.Context) {
	var req dto.UpstreamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.SysError("failed to bind upstream request: " + err.Error())
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "请求参数格式错误"})
		return
	}

	if req.Timeout <= 0 {
		req.Timeout = defaultTimeoutSeconds
	}

	var upstreams []dto.UpstreamDTO

	if len(req.Upstreams) > 0 {
		for _, u := range req.Upstreams {
			if strings.HasPrefix(u.BaseURL, "http") {
				if u.Endpoint == "" {
					u.Endpoint = defaultEndpoint
				}
				u.BaseURL = strings.TrimRight(u.BaseURL, "/")
				upstreams = append(upstreams, u)
			}
		}
	} else if len(req.ChannelIDs) > 0 {
		intIds := make([]int, 0, len(req.ChannelIDs))
		for _, id64 := range req.ChannelIDs {
			intIds = append(intIds, int(id64))
		}
		dbChannels, err := model.GetChannelsByIds(intIds)
		if err != nil {
			logger.LogError(c.Request.Context(), "failed to query channels: "+err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "查询渠道失败"})
			return
		}
		for _, ch := range dbChannels {
			if base := ch.GetBaseURL(); strings.HasPrefix(base, "http") {
				upstreams = append(upstreams, dto.UpstreamDTO{
					ID:       ch.Id,
					Name:     ch.Name,
					BaseURL:  strings.TrimRight(base, "/"),
					Endpoint: "",
				})
			}
		}
	}

	if len(upstreams) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无有效上游渠道"})
		return
	}

	var wg sync.WaitGroup
	ch := make(chan upstreamResult, len(upstreams))

	sem := make(chan struct{}, maxConcurrentFetches)

	dialer := &net.Dialer{Timeout: 10 * time.Second}
	transport := &http.Transport{MaxIdleConns: 100, IdleConnTimeout: 90 * time.Second, TLSHandshakeTimeout: 10 * time.Second, ExpectContinueTimeout: 1 * time.Second, ResponseHeaderTimeout: 10 * time.Second}
	if common.TLSInsecureSkipVerify {
		transport.TLSClientConfig = common.InsecureTLSConfig
	}
	transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			host = addr
		}
		// 对 github.io 优先尝试 IPv4，失败则回退 IPv6
		if strings.HasSuffix(host, "github.io") {
			if conn, err := dialer.DialContext(ctx, "tcp4", addr); err == nil {
				return conn, nil
			}
			return dialer.DialContext(ctx, "tcp6", addr)
		}
		return dialer.DialContext(ctx, network, addr)
	}
	client := &http.Client{Transport: transport}

	for _, chn := range upstreams {
		wg.Add(1)
		go func(chItem dto.UpstreamDTO) {
			defer wg.Done()

			sem <- struct{}{}
			defer func() { <-sem }()

			isOpenRouter := chItem.Endpoint == "openrouter"

			endpoint := chItem.Endpoint
			var fullURL string
			if isOpenRouter {
				fullURL = chItem.BaseURL + "/v1/models"
			} else if strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://") {
				fullURL = endpoint
			} else {
				if endpoint == "" {
					endpoint = defaultEndpoint
				} else if !strings.HasPrefix(endpoint, "/") {
					endpoint = "/" + endpoint
				}
				fullURL = chItem.BaseURL + endpoint
			}
			isModelsDev := isModelsDevAPIEndpoint(fullURL)

			uniqueName := chItem.Name
			if chItem.ID != 0 {
				uniqueName = fmt.Sprintf("%s(%d)", chItem.Name, chItem.ID)
			}

			ctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(req.Timeout)*time.Second)
			defer cancel()

			httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
			if err != nil {
				logger.LogWarn(c.Request.Context(), "build request failed: "+err.Error())
				ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
				return
			}

			// OpenRouter requires Bearer token auth
			if isOpenRouter && chItem.ID != 0 {
				dbCh, err := model.GetChannelById(chItem.ID, true)
				if err != nil {
					ch <- upstreamResult{Name: uniqueName, Err: "failed to get channel key: " + err.Error()}
					return
				}
				key, _, apiErr := dbCh.GetNextEnabledKey()
				if apiErr != nil {
					ch <- upstreamResult{Name: uniqueName, Err: "failed to get enabled channel key: " + apiErr.Error()}
					return
				}
				if strings.TrimSpace(key) == "" {
					ch <- upstreamResult{Name: uniqueName, Err: "no API key configured for this channel"}
					return
				}
				httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(key))
			} else if isOpenRouter {
				ch <- upstreamResult{Name: uniqueName, Err: "OpenRouter requires a valid channel with API key"}
				return
			}

			// 简单重试：最多 3 次，指数退避
			var resp *http.Response
			var lastErr error
			for attempt := 0; attempt < 3; attempt++ {
				resp, lastErr = client.Do(httpReq)
				if lastErr == nil {
					break
				}
				time.Sleep(time.Duration(200*(1<<attempt)) * time.Millisecond)
			}
			if lastErr != nil {
				logger.LogWarn(c.Request.Context(), "http error on "+chItem.Name+": "+lastErr.Error())
				ch <- upstreamResult{Name: uniqueName, Err: lastErr.Error()}
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				logger.LogWarn(c.Request.Context(), "non-200 from "+chItem.Name+": "+resp.Status)
				ch <- upstreamResult{Name: uniqueName, Err: resp.Status}
				return
			}

			// Content-Type 和响应体大小校验
			if ct := resp.Header.Get("Content-Type"); ct != "" && !strings.Contains(strings.ToLower(ct), "application/json") {
				logger.LogWarn(c.Request.Context(), "unexpected content-type from "+chItem.Name+": "+ct)
			}
			limited := io.LimitReader(resp.Body, maxRatioConfigBytes)
			bodyBytes, err := io.ReadAll(limited)
			if err != nil {
				logger.LogWarn(c.Request.Context(), "read response failed from "+chItem.Name+": "+err.Error())
				ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
				return
			}

			// type3: OpenRouter /v1/models -> convert per-token pricing to ratios
			if isOpenRouter {
				converted, err := convertOpenRouterToRatioData(bytes.NewReader(bodyBytes))
				if err != nil {
					logger.LogWarn(c.Request.Context(), "OpenRouter parse failed from "+chItem.Name+": "+err.Error())
					ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
					return
				}
				ch <- upstreamResult{Name: uniqueName, Data: converted}
				return
			}

			// type4: models.dev /api.json -> convert provider model pricing to ratios
			if isModelsDev {
				converted, err := convertModelsDevToRatioData(bytes.NewReader(bodyBytes))
				if err != nil {
					logger.LogWarn(c.Request.Context(), "models.dev parse failed from "+chItem.Name+": "+err.Error())
					ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
					return
				}
				ch <- upstreamResult{Name: uniqueName, Data: converted}
				return
			}

			// 兼容两种上游接口格式：
			//  type1: /api/ratio_config -> data 为 map[string]any，包含 model_ratio/completion_ratio/cache_ratio/model_price
			//  type2: /api/pricing      -> data 为 []Pricing 列表，需要转换为与 type1 相同的 map 格式
			var body struct {
				Success bool            `json:"success"`
				Data    json.RawMessage `json:"data"`
				Message string          `json:"message"`
			}

			if err := common.DecodeJson(bytes.NewReader(bodyBytes), &body); err != nil {
				logger.LogWarn(c.Request.Context(), "json decode failed from "+chItem.Name+": "+err.Error())
				ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
				return
			}

			if !body.Success {
				ch <- upstreamResult{Name: uniqueName, Err: body.Message}
				return
			}

			// 若 Data 为空，将继续按 type1 尝试解析（与多数静态 ratio_config 兼容）

			// 尝试按 type1 解析
			var type1Data map[string]any
			if err := common.Unmarshal(body.Data, &type1Data); err == nil {
				// 如果包含至少一个 ratioTypes 字段，则认为是 type1
				isType1 := false
				for _, rt := range pricingSyncFields {
					if _, ok := type1Data[rt]; ok {
						isType1 = true
						break
					}
				}
				if isType1 {
					ch <- upstreamResult{Name: uniqueName, Data: type1Data}
					return
				}
			}

			// 如果不是 type1，则尝试按 type2 (/api/pricing) 解析
			var pricingItems []struct {
				ModelName            string   `json:"model_name"`
				QuotaType            int      `json:"quota_type"`
				ModelRatio           float64  `json:"model_ratio"`
				ModelPrice           float64  `json:"model_price"`
				CompletionRatio      float64  `json:"completion_ratio"`
				CacheRatio           *float64 `json:"cache_ratio"`
				CreateCacheRatio     *float64 `json:"create_cache_ratio"`
				ImageRatio           *float64 `json:"image_ratio"`
				AudioRatio           *float64 `json:"audio_ratio"`
				AudioCompletionRatio *float64 `json:"audio_completion_ratio"`
				BillingMode          string   `json:"billing_mode"`
				BillingExpr          string   `json:"billing_expr"`
			}
			if err := common.Unmarshal(body.Data, &pricingItems); err != nil {
				logger.LogWarn(c.Request.Context(), "unrecognized data format from "+chItem.Name+": "+err.Error())
				ch <- upstreamResult{Name: uniqueName, Err: "无法解析上游返回数据"}
				return
			}

			modelRatioMap := make(map[string]float64)
			completionRatioMap := make(map[string]float64)
			cacheRatioMap := make(map[string]float64)
			createCacheRatioMap := make(map[string]float64)
			imageRatioMap := make(map[string]float64)
			audioRatioMap := make(map[string]float64)
			audioCompletionRatioMap := make(map[string]float64)
			modelPriceMap := make(map[string]float64)
			billingModeMap := make(map[string]string)
			billingExprMap := make(map[string]string)

			for _, item := range pricingItems {
				if item.ModelName == "" {
					continue
				}
				if item.BillingMode == billing_setting.BillingModeTieredExpr && strings.TrimSpace(item.BillingExpr) != "" {
					billingModeMap[item.ModelName] = billing_setting.BillingModeTieredExpr
					billingExprMap[item.ModelName] = item.BillingExpr
				}
				if item.QuotaType == 1 {
					modelPriceMap[item.ModelName] = item.ModelPrice
				} else {
					modelRatioMap[item.ModelName] = item.ModelRatio
					// completionRatio 可能为 0，此时也直接赋值，保持与上游一致
					completionRatioMap[item.ModelName] = item.CompletionRatio
				}
				if item.CacheRatio != nil {
					cacheRatioMap[item.ModelName] = *item.CacheRatio
				}
				if item.CreateCacheRatio != nil {
					createCacheRatioMap[item.ModelName] = *item.CreateCacheRatio
				}
				if item.ImageRatio != nil {
					imageRatioMap[item.ModelName] = *item.ImageRatio
				}
				if item.AudioRatio != nil {
					audioRatioMap[item.ModelName] = *item.AudioRatio
				}
				if item.AudioCompletionRatio != nil {
					audioCompletionRatioMap[item.ModelName] = *item.AudioCompletionRatio
				}
			}

			converted := make(map[string]any)

			if len(modelRatioMap) > 0 {
				ratioAny := make(map[string]any, len(modelRatioMap))
				for k, v := range modelRatioMap {
					ratioAny[k] = v
				}
				converted["model_ratio"] = ratioAny
			}

			if len(completionRatioMap) > 0 {
				compAny := make(map[string]any, len(completionRatioMap))
				for k, v := range completionRatioMap {
					compAny[k] = v
				}
				converted["completion_ratio"] = compAny
			}
			if len(cacheRatioMap) > 0 {
				converted["cache_ratio"] = valueMap(cacheRatioMap)
			}
			if len(createCacheRatioMap) > 0 {
				converted["create_cache_ratio"] = valueMap(createCacheRatioMap)
			}
			if len(imageRatioMap) > 0 {
				converted["image_ratio"] = valueMap(imageRatioMap)
			}
			if len(audioRatioMap) > 0 {
				converted["audio_ratio"] = valueMap(audioRatioMap)
			}
			if len(audioCompletionRatioMap) > 0 {
				converted["audio_completion_ratio"] = valueMap(audioCompletionRatioMap)
			}

			if len(modelPriceMap) > 0 {
				priceAny := make(map[string]any, len(modelPriceMap))
				for k, v := range modelPriceMap {
					priceAny[k] = v
				}
				converted["model_price"] = priceAny
			}
			if len(billingModeMap) > 0 {
				converted[billing_setting.BillingModeField] = valueMap(billingModeMap)
			}
			if len(billingExprMap) > 0 {
				converted[billing_setting.BillingExprField] = valueMap(billingExprMap)
			}

			ch <- upstreamResult{Name: uniqueName, Data: converted}
		}(chn)
	}

	wg.Wait()
	close(ch)

	localData := getLocalPricingSyncData()

	var testResults []dto.TestResult
	var successfulChannels []struct {
		name string
		data map[string]any
	}

	for r := range ch {
		if r.Err != "" {
			testResults = append(testResults, dto.TestResult{
				Name:   r.Name,
				Status: "error",
				Error:  r.Err,
			})
		} else {
			testResults = append(testResults, dto.TestResult{
				Name:   r.Name,
				Status: "success",
			})
			successfulChannels = append(successfulChannels, struct {
				name string
				data map[string]any
			}{name: r.Name, data: r.Data})
		}
	}

	differences := buildDifferences(localData, successfulChannels)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"differences":  differences,
			"test_results": testResults,
		},
	})
}

func GetSyncableChannels(c *gin.Context) {
	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	var syncableChannels []dto.SyncableChannel
	for _, channel := range channels {
		if channel.GetBaseURL() != "" {
			syncableChannels = append(syncableChannels, dto.SyncableChannel{
				ID:      channel.Id,
				Name:    channel.Name,
				BaseURL: channel.GetBaseURL(),
				Status:  channel.Status,
				Type:    channel.Type,
			})
		}
	}

	syncableChannels = append(syncableChannels, dto.SyncableChannel{
		ID:      officialRatioPresetID,
		Name:    officialRatioPresetName,
		BaseURL: officialRatioPresetBaseURL,
		Status:  1,
	})

	syncableChannels = append(syncableChannels, dto.SyncableChannel{
		ID:      modelsDevPresetID,
		Name:    modelsDevPresetName,
		BaseURL: modelsDevPresetBaseURL,
		Status:  1,
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    syncableChannels,
	})
}
