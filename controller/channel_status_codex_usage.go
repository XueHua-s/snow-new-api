package controller

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/codex"

	"github.com/gin-gonic/gin"
)

const (
	channelStatusCodexUsageTimeout     = 35 * time.Second
	channelStatusCodexUsageConcurrency = 4
	channelStatusCodexUsageCacheTTL    = 15 * time.Second
)

var channelStatusCodexUsageCache = struct {
	sync.Mutex
	payload   *channelStatusCodexUsagePayload
	expiresAt time.Time
}{}

type channelStatusCodexUsageWindow struct {
	UsedPercent       float64 `json:"used_percent"`
	ResetAt           int64   `json:"reset_at"`
	ResetAfterSeconds int64   `json:"reset_after_seconds"`
	LimitWindow       int64   `json:"limit_window_seconds"`
}

type channelStatusCodexUsageGroup struct {
	Name           string                         `json:"name,omitempty"`
	MeteredFeature string                         `json:"metered_feature,omitempty"`
	FiveHourWindow *channelStatusCodexUsageWindow `json:"five_hour_window,omitempty"`
	WeeklyWindow   *channelStatusCodexUsageWindow `json:"weekly_window,omitempty"`
}

type channelStatusCodexUsageItem struct {
	Name             string                         `json:"name"`
	PlanType         string                         `json:"plan_type,omitempty"`
	Available        *bool                          `json:"available,omitempty"`
	UpstreamStatus   int                            `json:"upstream_status,omitempty"`
	BaseLimit        channelStatusCodexUsageGroup   `json:"base_limit"`
	AdditionalLimits []channelStatusCodexUsageGroup `json:"additional_limits"`
	Error            string                         `json:"error,omitempty"`
}

type channelStatusCodexUsagePayload struct {
	Channels  []channelStatusCodexUsageItem `json:"channels"`
	UpdatedAt int64                         `json:"updated_at"`
}

type codexUsageUpstreamWindow struct {
	UsedPercent       float64 `json:"used_percent"`
	ResetAt           int64   `json:"reset_at"`
	ResetAfterSeconds int64   `json:"reset_after_seconds"`
	LimitWindow       int64   `json:"limit_window_seconds"`
}

type codexUsageUpstreamRateLimit struct {
	PlanType        string                    `json:"plan_type"`
	Allowed         *bool                     `json:"allowed"`
	LimitReached    *bool                     `json:"limit_reached"`
	PrimaryWindow   *codexUsageUpstreamWindow `json:"primary_window"`
	SecondaryWindow *codexUsageUpstreamWindow `json:"secondary_window"`
}

type codexUsageUpstreamAdditionalLimit struct {
	LimitName      string                      `json:"limit_name"`
	MeteredFeature string                      `json:"metered_feature"`
	RateLimit      codexUsageUpstreamRateLimit `json:"rate_limit"`
}

type codexUsageUpstreamPayload struct {
	PlanType             string                              `json:"plan_type"`
	RateLimit            codexUsageUpstreamRateLimit         `json:"rate_limit"`
	AdditionalRateLimits []codexUsageUpstreamAdditionalLimit `json:"additional_rate_limits"`
}

func sanitizeCodexUsageWindow(window *codexUsageUpstreamWindow) *channelStatusCodexUsageWindow {
	if window == nil {
		return nil
	}
	return &channelStatusCodexUsageWindow{
		UsedPercent:       window.UsedPercent,
		ResetAt:           window.ResetAt,
		ResetAfterSeconds: window.ResetAfterSeconds,
		LimitWindow:       window.LimitWindow,
	}
}

// resolveCodexUsageWindows hides the upstream primary/secondary ordering.
// The UI receives semantic buckets and does not need to know provider quirks.
func resolveCodexUsageWindows(
	planType string,
	rateLimit codexUsageUpstreamRateLimit,
) (*channelStatusCodexUsageWindow, *channelStatusCodexUsageWindow) {
	windows := []*codexUsageUpstreamWindow{rateLimit.PrimaryWindow, rateLimit.SecondaryWindow}
	var fiveHourWindow *codexUsageUpstreamWindow
	var weeklyWindow *codexUsageUpstreamWindow

	for _, window := range windows {
		if window == nil || window.LimitWindow <= 0 {
			continue
		}
		if window.LimitWindow >= int64((24 * time.Hour).Seconds()) {
			if weeklyWindow == nil {
				weeklyWindow = window
			}
			continue
		}
		if fiveHourWindow == nil {
			fiveHourWindow = window
		}
	}

	if strings.EqualFold(strings.TrimSpace(planType), "free") {
		if weeklyWindow == nil {
			weeklyWindow = rateLimit.PrimaryWindow
			if weeklyWindow == nil {
				weeklyWindow = rateLimit.SecondaryWindow
			}
		}
		return nil, sanitizeCodexUsageWindow(weeklyWindow)
	}

	if fiveHourWindow == nil && weeklyWindow == nil {
		fiveHourWindow = rateLimit.PrimaryWindow
		weeklyWindow = rateLimit.SecondaryWindow
	} else {
		if fiveHourWindow == nil {
			if rateLimit.PrimaryWindow != weeklyWindow {
				fiveHourWindow = rateLimit.PrimaryWindow
			} else {
				fiveHourWindow = rateLimit.SecondaryWindow
			}
		}
		if weeklyWindow == nil {
			if rateLimit.PrimaryWindow != fiveHourWindow {
				weeklyWindow = rateLimit.PrimaryWindow
			} else {
				weeklyWindow = rateLimit.SecondaryWindow
			}
		}
	}

	return sanitizeCodexUsageWindow(fiveHourWindow), sanitizeCodexUsageWindow(weeklyWindow)
}

func codexUsageAvailability(rateLimit codexUsageUpstreamRateLimit) *bool {
	if rateLimit.Allowed == nil && rateLimit.LimitReached == nil {
		return nil
	}
	available := rateLimit.Allowed != nil && *rateLimit.Allowed
	if rateLimit.LimitReached != nil && *rateLimit.LimitReached {
		available = false
	}
	return &available
}

func buildChannelStatusCodexUsage(
	channelName string,
	statusCode int,
	body []byte,
	fetchErr error,
) channelStatusCodexUsageItem {
	item := channelStatusCodexUsageItem{
		Name:             channelName,
		UpstreamStatus:   statusCode,
		AdditionalLimits: []channelStatusCodexUsageGroup{},
	}
	if fetchErr != nil {
		item.Error = "usage temporarily unavailable"
		return item
	}

	var payload codexUsageUpstreamPayload
	if err := common.Unmarshal(body, &payload); err != nil {
		item.Error = "usage temporarily unavailable"
		return item
	}
	if statusCode < http.StatusOK || statusCode >= http.StatusMultipleChoices {
		item.Error = "usage temporarily unavailable"
		return item
	}

	item.PlanType = strings.TrimSpace(payload.PlanType)
	if item.PlanType == "" {
		item.PlanType = strings.TrimSpace(payload.RateLimit.PlanType)
	}
	item.Available = codexUsageAvailability(payload.RateLimit)
	item.BaseLimit.FiveHourWindow, item.BaseLimit.WeeklyWindow = resolveCodexUsageWindows(
		item.PlanType,
		payload.RateLimit,
	)

	for _, additional := range payload.AdditionalRateLimits {
		name := strings.TrimSpace(additional.LimitName)
		meteredFeature := strings.TrimSpace(additional.MeteredFeature)
		if name == "" && meteredFeature == "" {
			continue
		}
		group := channelStatusCodexUsageGroup{
			Name:           name,
			MeteredFeature: meteredFeature,
		}
		additionalPlanType := strings.TrimSpace(additional.RateLimit.PlanType)
		if additionalPlanType == "" {
			additionalPlanType = item.PlanType
		}
		group.FiveHourWindow, group.WeeklyWindow = resolveCodexUsageWindows(
			additionalPlanType,
			additional.RateLimit,
		)
		item.AdditionalLimits = append(item.AdditionalLimits, group)
	}

	return item
}

func isChannelStatusCodexOAuthChannel(channel *model.Channel) bool {
	if channel == nil || channel.Type != constant.ChannelTypeCodex || channel.ChannelInfo.IsMultiKey {
		return false
	}
	oauthKey, err := codex.ParseOAuthKey(strings.TrimSpace(channel.Key))
	if err != nil {
		return false
	}
	credentialType := strings.TrimSpace(oauthKey.Type)
	return strings.TrimSpace(oauthKey.AccessToken) != "" &&
		strings.TrimSpace(oauthKey.AccountID) != "" &&
		(credentialType == "" || strings.EqualFold(credentialType, "codex"))
}

func fetchChannelStatusCodexUsageItem(
	ctx context.Context,
	channel *model.Channel,
) channelStatusCodexUsageItem {
	statusCode, body, err := fetchCodexChannelUsage(ctx, channel)
	if err != nil {
		common.SysError("failed to fetch channel-status Codex usage: " + err.Error())
	}
	return buildChannelStatusCodexUsage(channel.Name, statusCode, body, err)
}

// loadChannelStatusCodexUsage serializes refreshes and briefly caches only the
// sanitized DTO. This prevents concurrent page views from multiplying OAuth
// requests while ensuring credentials and account identity never enter cache.
func loadChannelStatusCodexUsage(ctx context.Context, forceRefresh bool) (channelStatusCodexUsagePayload, error) {
	channelStatusCodexUsageCache.Lock()
	defer channelStatusCodexUsageCache.Unlock()

	if !forceRefresh && channelStatusCodexUsageCache.payload != nil && time.Now().Before(channelStatusCodexUsageCache.expiresAt) {
		return *channelStatusCodexUsageCache.payload, nil
	}

	channels, err := model.GetChannelsByTypeWithKey(constant.ChannelTypeCodex)
	if err != nil {
		return channelStatusCodexUsagePayload{}, err
	}

	oauthChannels := make([]*model.Channel, 0, len(channels))
	for _, channel := range channels {
		if isChannelStatusCodexOAuthChannel(channel) {
			oauthChannels = append(oauthChannels, channel)
		}
	}

	ctx, cancel := context.WithTimeout(ctx, channelStatusCodexUsageTimeout)
	defer cancel()
	items := make([]channelStatusCodexUsageItem, len(oauthChannels))
	semaphore := make(chan struct{}, channelStatusCodexUsageConcurrency)
	var waitGroup sync.WaitGroup

	for index, channel := range oauthChannels {
		index := index
		channel := channel
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			select {
			case semaphore <- struct{}{}:
				defer func() { <-semaphore }()
				items[index] = fetchChannelStatusCodexUsageItem(ctx, channel)
			case <-ctx.Done():
				items[index] = buildChannelStatusCodexUsage(channel.Name, 0, nil, ctx.Err())
			}
		}()
	}
	waitGroup.Wait()

	payload := channelStatusCodexUsagePayload{
		Channels:  items,
		UpdatedAt: time.Now().Unix(),
	}
	channelStatusCodexUsageCache.payload = &payload
	channelStatusCodexUsageCache.expiresAt = time.Now().Add(channelStatusCodexUsageCacheTTL)
	return payload, nil
}

func GetChannelStatusCodexUsage(c *gin.Context) {
	forceRefresh := strings.EqualFold(strings.TrimSpace(c.Query("refresh")), "true")
	payload, err := loadChannelStatusCodexUsage(c.Request.Context(), forceRefresh)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    payload,
	})
}
