package service

import "github.com/QuantumNous/new-api/model"

type UsageLeaderboardResponse struct {
	Period     string                `json:"period"`
	StartsAt   int64                 `json:"starts_at"`
	EndsAt     int64                 `json:"ends_at"`
	UpdatedAt  int64                 `json:"updated_at"`
	TokenBoard UsageLeaderboardBoard `json:"token_board"`
	QuotaBoard UsageLeaderboardBoard `json:"quota_board"`
}

type UsageLeaderboardBoard struct {
	Total       int64                        `json:"total"`
	ActiveUsers int                          `json:"active_users"`
	Champion    *UsageLeaderboardEntry       `json:"champion"`
	Top         []UsageLeaderboardEntry      `json:"top"`
	Self        UsageLeaderboardSelf         `json:"self"`
	Trend       []UsageLeaderboardTrendPoint `json:"trend"`
}

type UsageLeaderboardEntry struct {
	Rank         int     `json:"rank"`
	Username     string  `json:"username"`
	IsCurrent    bool    `json:"is_current"`
	Value        int64   `json:"value"`
	Share        float64 `json:"share"`
	PreviousRank *int    `json:"previous_rank,omitempty"`
	RankDelta    int     `json:"rank_delta"`
}

type UsageLeaderboardSelf struct {
	UsageLeaderboardEntry
	Ranked           bool    `json:"ranked"`
	GapToPrevious    int64   `json:"gap_to_previous"`
	GapToLeader      int64   `json:"gap_to_leader"`
	GapToTopTen      int64   `json:"gap_to_top_ten"`
	SurpassedPercent float64 `json:"surpassed_percent"`
}

type UsageLeaderboardTrendPoint struct {
	Bucket    int64  `json:"bucket"`
	Username  string `json:"username"`
	IsCurrent bool   `json:"is_current"`
	Value     int64  `json:"value"`
}

type usageLeaderboardMetric struct {
	value       func(model.UsageLeaderboardTotal) int64
	bucketValue func(model.UsageLeaderboardBucket) int64
}

type usageLeaderboardRankedTotal struct {
	total model.UsageLeaderboardTotal
	rank  int
	value int64
}
