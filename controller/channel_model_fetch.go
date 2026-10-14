package controller

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaychannel "github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/advancedcustom"
	"github.com/QuantumNous/new-api/relay/channel/gemini"
	"github.com/QuantumNous/new-api/relay/channel/ollama"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"

	"github.com/samber/lo"
)

type OpenAIModel struct {
	ID         string         `json:"id"`
	Object     string         `json:"object"`
	Created    int64          `json:"created"`
	OwnedBy    string         `json:"owned_by"`
	Metadata   map[string]any `json:"metadata,omitempty"`
	Permission []struct {
		ID                 string `json:"id"`
		Object             string `json:"object"`
		Created            int64  `json:"created"`
		AllowCreateEngine  bool   `json:"allow_create_engine"`
		AllowSampling      bool   `json:"allow_sampling"`
		AllowLogprobs      bool   `json:"allow_logprobs"`
		AllowSearchIndices bool   `json:"allow_search_indices"`
		AllowView          bool   `json:"allow_view"`
		AllowFineTuning    bool   `json:"allow_fine_tuning"`
		Organization       string `json:"organization"`
		Group              string `json:"group"`
		IsBlocking         bool   `json:"is_blocking"`
	} `json:"permission"`
	Root   string `json:"root"`
	Parent string `json:"parent"`
}

type OpenAIModelsResponse struct {
	Data    []OpenAIModel `json:"data"`
	Success bool          `json:"success"`
}

func buildFetchModelsHeaders(channel *model.Channel, key string) (http.Header, error) {
	var headers http.Header
	switch channel.Type {
	case constant.ChannelTypeAnthropic:
		headers = GetClaudeAuthHeader(key)
	case constant.ChannelTypeClaudeOAuth:
		oauthKey, err := service.EnsureClaudeOAuthCredential(
			context.Background(),
			channel.Id,
			key,
			channel.GetSetting().Proxy,
		)
		if err != nil {
			return nil, err
		}
		headers = GetAuthHeader(strings.TrimSpace(oauthKey.AccessToken))
		headers.Set("anthropic-version", "2023-06-01")
		headers.Set("anthropic-beta", strings.Join(service.ClaudeOAuthBetaHeaders, ","))
		headers.Set("user-agent", service.ClaudeOAuthUserAgent)
	default:
		headers = GetAuthHeader(key)
	}

	if err := applyFetchModelsHeaderOverrides(channel, key, headers); err != nil {
		return nil, err
	}
	return headers, nil
}

func applyFetchModelsHeaderOverrides(channel *model.Channel, key string, headers http.Header) error {
	info := &relaycommon.RelayInfo{
		IsChannelTest: true,
		ChannelMeta: &relaycommon.ChannelMeta{
			ApiKey:          key,
			HeadersOverride: channel.GetHeaderOverride(),
		},
	}
	overrides, err := relaychannel.ResolveHeaderOverride(info, nil)
	if err != nil {
		return err
	}
	for name, value := range overrides {
		headers.Set(name, value)
	}

	return nil
}

func parseOpenAIModelIDs(body []byte) ([]string, error) {
	var result struct {
		Data *[]OpenAIModel `json:"data"`
	}
	if err := common.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("invalid OpenAI Models response: %w", err)
	}
	if result.Data == nil {
		return nil, fmt.Errorf("invalid OpenAI Models response: data is required")
	}
	ids := normalizeModelNames(lo.Map(*result.Data, func(item OpenAIModel, _ int) string {
		return item.ID
	}))
	if len(ids) == 0 {
		return nil, fmt.Errorf("OpenAI Models response contains no valid model IDs")
	}
	return ids, nil
}

func sanitizeFetchModelsError(err error, key string) error {
	if err == nil {
		return nil
	}

	// net/http includes the complete request URL in url.Error. Discovery routes
	// may put the API key in a custom query name or value, so never return that
	// wrapper to an API client.
	var urlErr *url.Error
	if errors.As(err, &urlErr) && urlErr.Err != nil {
		err = urlErr.Err
	}

	message := err.Error()
	key = strings.TrimSpace(key)
	if key != "" {
		message = strings.ReplaceAll(message, key, "[REDACTED]")
		message = strings.ReplaceAll(message, url.QueryEscape(key), "[REDACTED]")
		message = strings.ReplaceAll(message, url.PathEscape(key), "[REDACTED]")
	}
	return errors.New(message)
}

func sanitizeAdvancedCustomRequestError(err error, key string, requestURL string) error {
	err = sanitizeFetchModelsError(err, key)
	if err == nil {
		return nil
	}
	parsedURL, parseErr := url.Parse(requestURL)
	if parseErr != nil {
		return err
	}
	message := err.Error()
	for _, value := range parsedURL.Query() {
		for _, secret := range value {
			if secret == "" {
				continue
			}
			message = strings.ReplaceAll(message, secret, "[REDACTED]")
			message = strings.ReplaceAll(message, url.QueryEscape(secret), "[REDACTED]")
			message = strings.ReplaceAll(message, url.PathEscape(secret), "[REDACTED]")
		}
	}
	if key != "" {
		message = strings.ReplaceAll(message, key, "[REDACTED]")
		message = strings.ReplaceAll(message, url.QueryEscape(key), "[REDACTED]")
		message = strings.ReplaceAll(message, url.PathEscape(key), "[REDACTED]")
	}
	return errors.New(message)
}

func getFetchModelsResponseBody(method string, requestURL string, channel *model.Channel, headers http.Header) ([]byte, error) {
	request, err := http.NewRequest(method, requestURL, nil)
	if err != nil {
		return nil, err
	}
	for name, values := range headers {
		for _, value := range values {
			request.Header.Add(name, value)
		}
		if strings.EqualFold(name, "Host") {
			request.Host = headers.Get(name)
		}
	}
	client, err := service.NewProxyHttpClient(channel.GetSetting().Proxy)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status code: %d", response.StatusCode)
	}
	return io.ReadAll(response.Body)
}

// fetchChannelUpstreamModelIDs owns provider-specific discovery, authentication,
// proxy transport and response decoding. Callers receive normalized model IDs.
func fetchChannelUpstreamModelIDs(channel *model.Channel) ([]string, error) {
	baseURL := constant.ChannelBaseURLs[channel.Type]
	if channel.GetBaseURL() != "" {
		baseURL = channel.GetBaseURL()
	}

	if channel.Type == constant.ChannelTypeOllama {
		key := strings.TrimSpace(strings.Split(channel.Key, "\n")[0])
		models, err := ollama.FetchOllamaModels(baseURL, key)
		if err != nil {
			return nil, err
		}
		return normalizeModelNames(lo.Map(models, func(item ollama.OllamaModel, _ int) string {
			return item.Name
		})), nil
	}

	if channel.Type == constant.ChannelTypeGemini {
		key, _, apiErr := channel.GetNextEnabledKey()
		if apiErr != nil {
			return nil, fmt.Errorf("获取渠道密钥失败: %w", apiErr)
		}
		key = strings.TrimSpace(key)
		models, err := gemini.FetchGeminiModels(baseURL, key, channel.GetSetting().Proxy)
		if err != nil {
			return nil, err
		}
		return normalizeModelNames(models), nil
	}

	if channel.Type == constant.ChannelTypeAdvancedCustom {
		return fetchAdvancedCustomUpstreamModelIDs(channel, baseURL)
	}

	if channel.Type == constant.ChannelTypeCodex {
		return service.FetchCodexChannelModels(channel)
	}

	var url string
	switch channel.Type {
	case constant.ChannelTypeAli:
		url = fmt.Sprintf("%s/compatible-mode/v1/models", baseURL)
	case constant.ChannelTypeZhipu_v4:
		if plan, ok := constant.ChannelSpecialBases[baseURL]; ok && plan.OpenAIBaseURL != "" {
			url = fmt.Sprintf("%s/models", plan.OpenAIBaseURL)
		} else {
			url = fmt.Sprintf("%s/api/paas/v4/models", baseURL)
		}
	case constant.ChannelTypeVolcEngine:
		if plan, ok := constant.ChannelSpecialBases[baseURL]; ok && plan.OpenAIBaseURL != "" {
			url = fmt.Sprintf("%s/v1/models", plan.OpenAIBaseURL)
		} else {
			url = fmt.Sprintf("%s/v1/models", baseURL)
		}
	case constant.ChannelTypeMoonshot:
		if plan, ok := constant.ChannelSpecialBases[baseURL]; ok && plan.OpenAIBaseURL != "" {
			url = fmt.Sprintf("%s/models", plan.OpenAIBaseURL)
		} else {
			url = fmt.Sprintf("%s/v1/models", baseURL)
		}
	default:
		url = fmt.Sprintf("%s/v1/models", baseURL)
	}

	key, _, apiErr := channel.GetNextEnabledKey()
	if apiErr != nil {
		return nil, fmt.Errorf("获取渠道密钥失败: %w", apiErr)
	}
	key = strings.TrimSpace(key)

	headers, err := buildFetchModelsHeaders(channel, key)
	if err != nil {
		return nil, sanitizeFetchModelsError(err, key)
	}

	body, err := getFetchModelsResponseBody(http.MethodGet, url, channel, headers)
	if err != nil {
		return nil, sanitizeAdvancedCustomRequestError(err, key, url)
	}

	var result OpenAIModelsResponse
	if err := common.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	ids := lo.Map(result.Data, func(item OpenAIModel, _ int) string {
		if channel.Type == constant.ChannelTypeGemini {
			return strings.TrimPrefix(item.ID, "models/")
		}
		return item.ID
	})
	return normalizeModelNames(ids), nil
}

func fetchAdvancedCustomUpstreamModelIDs(channel *model.Channel, baseURL string) ([]string, error) {
	key, _, apiErr := channel.GetNextEnabledKey()
	if apiErr != nil {
		return nil, fmt.Errorf("获取渠道密钥失败: %w", apiErr)
	}
	key = strings.TrimSpace(key)

	info := &relaycommon.RelayInfo{
		RelayFormat:    types.RelayFormatOpenAI,
		RelayMode:      relayconstant.RelayModeUnknown,
		RequestURLPath: dto.AdvancedCustomModelListPath,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:          constant.ChannelTypeAdvancedCustom,
			ChannelBaseUrl:       baseURL,
			ApiKey:               key,
			ChannelOtherSettings: channel.GetOtherSettings(),
		},
	}

	adaptor := &advancedcustom.Adaptor{}
	url, headers, err := adaptor.BuildModelListRequest(info)
	if err != nil {
		return nil, sanitizeFetchModelsError(err, key)
	}
	if err := applyFetchModelsHeaderOverrides(channel, key, headers); err != nil {
		return nil, sanitizeFetchModelsError(err, key)
	}

	body, err := getFetchModelsResponseBody(http.MethodGet, url, channel, headers)
	if err != nil {
		return nil, sanitizeFetchModelsError(err, key)
	}
	return parseOpenAIModelIDs(body)
}
