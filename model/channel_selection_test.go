package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	appdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Candidate growth must not add SQL round trips to the uncached relay path.
func TestChannelSelectionQueryCountDoesNotGrowWithCandidates(t *testing.T) {
	setupChannelStatusTest(t)
	queries := 0
	const callback = "test:channel_selection_queries"
	require.NoError(t, DB.Callback().Query().Before("gorm:query").Register(callback, func(*gorm.DB) { queries++ }))
	t.Cleanup(func() { require.NoError(t, DB.Callback().Query().Remove(callback)) })
	var candidateIDs []int
	var baseline int
	for _, name := range []string{"first", "second", "third"} {
		channel := Channel{Name: name, Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Models: "selection-model", Group: "default", Priority: common.GetPointer(int64(0))}
		require.NoError(t, DB.Create(&channel).Error)
		require.NoError(t, channel.AddAbilities(DB))
		candidateIDs = append(candidateIDs, channel.Id)
		queries = 0
		selected, err := GetRandomSatisfiedChannel("default", "selection-model", 0, "/v1/responses", appdto.ChannelFilter{Kind: appdto.FilterRequestPath, RequestPath: "/v1/responses"})
		require.NoError(t, err)
		require.NotNil(t, selected)
		assert.Contains(t, candidateIDs, selected.Id)
		if len(candidateIDs) == 1 {
			baseline = queries
		}
		assert.Equal(t, baseline, queries, "candidate growth must not add database round trips")
	}
}

func TestChannelSelectionFiltersBeforeWebSocketPriority(t *testing.T) {
	setupChannelStatusTest(t)
	var ids []int
	for _, candidate := range []struct {
		name     string
		priority int64
		enabled  bool
	}{{"http-only", 100, false}, {"ws-primary", 20, true}, {"ws-fallback", 10, true}} {
		setting := `{"responses_websocket_enabled":false}`
		if candidate.enabled {
			setting = `{"responses_websocket_enabled":true}`
		}
		channel := Channel{Name: candidate.name, Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Models: "selection-model", Group: "default", Priority: &candidate.priority, Setting: &setting}
		require.NoError(t, DB.Create(&channel).Error)
		require.NoError(t, channel.AddAbilities(DB))
		ids = append(ids, channel.Id)
	}
	for retry, expected := range []int{ids[1], ids[2], ids[2]} {
		selected, err := GetRandomSatisfiedChannel("default", "selection-model", retry, "/v1/responses", appdto.ChannelFilter{Kind: appdto.FilterResponsesWebSocket})
		require.NoError(t, err)
		require.NotNil(t, selected)
		assert.Equal(t, expected, selected.Id)
	}
}

func TestChannelSelectionCombinesPathAndWebSocketPolicy(t *testing.T) {
	setupChannelStatusTest(t)
	var expected int
	for _, candidate := range []struct {
		name, path string
		websocket  bool
	}{
		{"wrong-path", "/v1/chat/completions", true},
		{"http-only", "/v1/responses", false},
		{"native-responses", "/v1/responses", true},
	} {
		channel := Channel{Name: candidate.name, Type: constant.ChannelTypeAdvancedCustom, Status: common.ChannelStatusEnabled, Models: "selection-model", Group: "default", Priority: common.GetPointer(int64(0))}
		channel.SetSetting(dto.ChannelSettings{ResponsesWebSocketEnabled: candidate.websocket})
		channel.SetOtherSettings(dto.ChannelOtherSettings{AdvancedCustom: &dto.AdvancedCustomConfig{Routes: []dto.AdvancedCustomRoute{{IncomingPath: candidate.path, UpstreamPath: candidate.path}}}})
		require.NoError(t, DB.Create(&channel).Error)
		require.NoError(t, channel.AddAbilities(DB))
		if candidate.name == "native-responses" {
			expected = channel.Id
		}
	}
	selected, err := GetRandomSatisfiedChannel("default", "selection-model", 0, "/v1/responses", appdto.ChannelFilter{Kind: appdto.FilterResponsesWebSocket})
	require.NoError(t, err)
	require.NotNil(t, selected)
	assert.Equal(t, expected, selected.Id)
	selected, err = GetRandomSatisfiedChannel("default", "selection-model", 0, "/v1/embeddings", appdto.ChannelFilter{Kind: appdto.FilterResponsesWebSocket})
	require.NoError(t, err)
	assert.Nil(t, selected, "no matching path must never fall back to an incompatible channel")
}
