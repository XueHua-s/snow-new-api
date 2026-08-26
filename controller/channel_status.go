package controller

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	channelStatusUpstreamEndpoint  = "https://speed.sbbbbbbbbb.xyz/api/pulse"
	channelStatusHeartbeatInterval = time.Second
	channelStatusFetchTimeout      = 8 * time.Second
	channelStatusWriteTimeout      = 5 * time.Second
	channelStatusMaxResponseBytes  = 1 << 20
)

var channelStatusWindows = map[int]struct{}{
	60:     {},
	300:    {},
	900:    {},
	604800: {},
}

type ChannelStatusModel struct {
	Model        string   `json:"model"`
	Section      string   `json:"section"`
	Family       string   `json:"family"`
	AverageTTFT  int64    `json:"avg_ttft_ms"`
	MinimumTTFT  int64    `json:"min_ttft_ms"`
	MaximumTTFT  int64    `json:"max_ttft_ms"`
	AverageResp  float64  `json:"avg_resp_sec"`
	SuccessRate  float64  `json:"success_rate"`
	ErrorRate    float64  `json:"error_rate"`
	EmptyRate    float64  `json:"empty_rate"`
	Health       string   `json:"health"`
	RequestState string   `json:"request_state"`
	LastErrors   []string `json:"last_errors,omitempty"`
	StreamRate   *float64 `json:"stream_rate,omitempty"`
	Groups       []string `json:"groups,omitempty"`
}

type ChannelStatusPulse struct {
	ServerTime    int64                `json:"server_time_ms"`
	GeneratedTime int64                `json:"generated_ms"`
	WindowSeconds int                  `json:"window_seconds"`
	WindowEnd     int64                `json:"window_end_ms"`
	OverallTTFT   int64                `json:"overall_ttft_ms"`
	MinimumTTFT   int64                `json:"min_ttft_ms"`
	MaximumTTFT   int64                `json:"max_ttft_ms"`
	Models        []ChannelStatusModel `json:"models"`
	Demo          bool                 `json:"demo"`
	Error         string               `json:"error,omitempty"`
}

type channelStatusWebSocketMessage struct {
	Type      string              `json:"type"`
	Timestamp int64               `json:"timestamp_ms"`
	Window    int                 `json:"window_seconds"`
	Data      *ChannelStatusPulse `json:"data,omitempty"`
	Error     string              `json:"error,omitempty"`
}

type channelStatusFetchResult struct {
	pulse *ChannelStatusPulse
	err   error
}

func buildChannelStatusModels(
	models []ChannelStatusModel,
	pricing []model.Pricing,
	vendors []model.PricingVendor,
) []ChannelStatusModel {
	vendorNames := make(map[int]string, len(vendors))
	for _, vendor := range vendors {
		vendorNames[vendor.ID] = vendor.Name
	}

	catalog := make(map[string]model.Pricing, len(pricing))
	catalogModelNames := make([]string, 0, len(pricing))
	for _, pricingItem := range pricing {
		if _, exists := catalog[pricingItem.ModelName]; !exists {
			catalogModelNames = append(catalogModelNames, pricingItem.ModelName)
		}
		catalog[pricingItem.ModelName] = pricingItem
	}
	sort.Strings(catalogModelNames)

	result := make([]ChannelStatusModel, 0, len(models)+len(catalog))
	modelsWithTelemetry := make(map[string]struct{}, len(models))
	seenSectionModels := make(map[string]struct{}, len(models))
	for _, item := range models {
		pricingItem, exists := catalog[item.Model]
		if !exists {
			continue
		}

		item.Section = strings.TrimSpace(item.Section)
		if item.Section == "" {
			item.Section = "available"
		}
		sectionModelKey := item.Section + "\x00" + item.Model
		if _, exists = seenSectionModels[sectionModelKey]; exists {
			continue
		}
		seenSectionModels[sectionModelKey] = struct{}{}
		modelsWithTelemetry[item.Model] = struct{}{}
		item.Family = vendorNames[pricingItem.VendorID]
		if item.Family == "" {
			item.Family = channelStatusFamily(pricingItem.ModelName)
		}
		item.Groups = orderedChannelStatusGroups(pricingItem.EnableGroup)
		result = append(result, item)
	}

	for _, modelName := range catalogModelNames {
		if _, exists := modelsWithTelemetry[modelName]; exists {
			continue
		}
		pricingItem := catalog[modelName]
		family := vendorNames[pricingItem.VendorID]
		if family == "" {
			family = channelStatusFamily(modelName)
		}
		result = append(result, ChannelStatusModel{
			Model:        modelName,
			Section:      "available",
			Family:       family,
			Health:       "idle",
			RequestState: "no_requests",
			Groups:       orderedChannelStatusGroups(pricingItem.EnableGroup),
		})
	}

	sort.SliceStable(result, func(left, right int) bool {
		leftSectionRank := channelStatusSectionRank(result[left].Section)
		rightSectionRank := channelStatusSectionRank(result[right].Section)
		if leftSectionRank != rightSectionRank {
			return leftSectionRank < rightSectionRank
		}
		if result[left].Section != result[right].Section {
			return result[left].Section < result[right].Section
		}
		leftRank := channelStatusFamilyRank(result[left].Family)
		rightRank := channelStatusFamilyRank(result[right].Family)
		if leftRank != rightRank {
			return leftRank < rightRank
		}
		if result[left].Family != result[right].Family {
			return result[left].Family < result[right].Family
		}
		return result[left].Model < result[right].Model
	})
	return result
}

func channelStatusSectionRank(section string) int {
	switch section {
	case "普通分组":
		return 0
	case "available":
		return 2
	default:
		return 1
	}
}

func channelStatusFamily(modelName string) string {
	switch {
	case strings.HasPrefix(modelName, "gpt-"):
		return "OpenAI"
	case strings.HasPrefix(modelName, "claude-"):
		return "Claude"
	case strings.HasPrefix(modelName, "deepseek-"):
		return "DeepSeek"
	default:
		return "其他"
	}
}

func channelStatusFamilyRank(family string) int {
	switch family {
	case "Anthropic":
		return 0
	case "OpenAI":
		return 1
	case "Venice AI":
		return 2
	case "Vivgrid":
		return 3
	default:
		return 4
	}
}

func orderedChannelStatusGroups(groups []string) []string {
	ordered := append([]string(nil), groups...)
	sort.SliceStable(ordered, func(left, right int) bool {
		if ordered[left] == ordered[right] {
			return false
		}
		if ordered[left] == "default" {
			return true
		}
		if ordered[right] == "default" {
			return false
		}
		return ordered[left] < ordered[right]
	})
	return ordered
}

var channelStatusUpgrader = websocket.Upgrader{
	HandshakeTimeout: 5 * time.Second,
	CheckOrigin:      isChannelStatusOriginAllowed,
}

func isChannelStatusOriginAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}

	parsedOrigin, err := url.Parse(origin)
	if err != nil {
		return false
	}

	originHostname := parsedOrigin.Hostname()
	requestHostname := r.Host
	if hostname, _, splitErr := net.SplitHostPort(r.Host); splitErr == nil {
		requestHostname = hostname
	}
	requestHostname = strings.Trim(requestHostname, "[]")

	return originHostname != "" &&
		requestHostname != "" &&
		strings.EqualFold(originHostname, requestHostname)
}

func parseChannelStatusWindow(raw string) (int, error) {
	if raw == "" {
		return 60, nil
	}

	window, err := strconv.Atoi(raw)
	if err != nil {
		return 0, errors.New("invalid channel status window")
	}
	if _, ok := channelStatusWindows[window]; !ok {
		return 0, errors.New("unsupported channel status window")
	}

	return window, nil
}

func fetchChannelStatus(
	ctx context.Context,
	client *http.Client,
	endpoint string,
	window int,
) (*ChannelStatusPulse, error) {
	upstreamURL, err := url.Parse(endpoint)
	if err != nil {
		return nil, fmt.Errorf("parse channel status endpoint: %w", err)
	}

	query := upstreamURL.Query()
	query.Set("window", strconv.Itoa(window))
	upstreamURL.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, upstreamURL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create channel status request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "new-api-channel-status/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request channel status: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("channel status upstream returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, channelStatusMaxResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read channel status response: %w", err)
	}
	if len(body) > channelStatusMaxResponseBytes {
		return nil, errors.New("channel status response is too large")
	}

	var pulse ChannelStatusPulse
	if err = common.Unmarshal(body, &pulse); err != nil {
		return nil, fmt.Errorf("decode channel status response: %w", err)
	}
	if pulse.WindowSeconds == 0 {
		pulse.WindowSeconds = window
	}
	if pulse.Models == nil {
		pulse.Models = []ChannelStatusModel{}
	}

	return &pulse, nil
}

func writeChannelStatusMessage(
	conn *websocket.Conn,
	messageType string,
	window int,
	pulse *ChannelStatusPulse,
	err error,
) error {
	message := channelStatusWebSocketMessage{
		Type:      messageType,
		Timestamp: time.Now().UnixMilli(),
		Window:    window,
		Data:      pulse,
	}
	if err != nil {
		message.Error = "channel status is temporarily unavailable"
	}

	if writeErr := conn.SetWriteDeadline(time.Now().Add(channelStatusWriteTimeout)); writeErr != nil {
		return writeErr
	}
	return conn.WriteJSON(message)
}

func serveChannelStatusWebSocket(
	c *gin.Context,
	endpoint string,
	client *http.Client,
	pricingProvider func() []model.Pricing,
	vendorProvider func() []model.PricingVendor,
) {
	window, err := parseChannelStatusWindow(c.Query("window"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	conn, err := channelStatusUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	conn.SetReadLimit(1024)

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, readErr := conn.ReadMessage(); readErr != nil {
				return
			}
		}
	}()

	results := make(chan channelStatusFetchResult, 1)
	fetching := false
	triggerFetch := func() {
		if fetching {
			return
		}
		fetching = true
		go func() {
			fetchCtx, fetchCancel := context.WithTimeout(ctx, channelStatusFetchTimeout)
			defer fetchCancel()
			pulse, fetchErr := fetchChannelStatus(fetchCtx, client, endpoint, window)
			select {
			case results <- channelStatusFetchResult{pulse: pulse, err: fetchErr}:
			case <-ctx.Done():
			}
		}()
	}

	var latestPulse *ChannelStatusPulse
	var latestError error
	triggerFetch()

	heartbeat := time.NewTicker(channelStatusHeartbeatInterval)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-done:
			return
		case result := <-results:
			fetching = false
			latestError = result.err
			if result.err == nil {
				result.pulse.Models = buildChannelStatusModels(
					result.pulse.Models,
					pricingProvider(),
					vendorProvider(),
				)
				latestPulse = result.pulse
			}
			if err = writeChannelStatusMessage(conn, "snapshot", window, latestPulse, latestError); err != nil {
				return
			}
		case <-heartbeat.C:
			if err = writeChannelStatusMessage(conn, "heartbeat", window, latestPulse, latestError); err != nil {
				return
			}
			triggerFetch()
		}
	}
}

func GetChannelStatusWebSocket(c *gin.Context) {
	client := &http.Client{Timeout: channelStatusFetchTimeout}
	serveChannelStatusWebSocket(
		c,
		channelStatusUpstreamEndpoint,
		client,
		model.GetPricing,
		model.GetVendors,
	)
}
