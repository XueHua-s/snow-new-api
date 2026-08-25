package service

import (
	"sort"
	"time"

	"github.com/QuantumNous/new-api/model"
)

const (
	usageLeaderboardLimit    = 10
	usageLeaderboardTrendTop = 5
)

// GetUsageLeaderboard returns both supported ranking metrics from one cached
// aggregate snapshot. Callers only choose a calendar period; database grouping,
// rank comparison, self pinning, and trend selection stay hidden here.
func GetUsageLeaderboard(period string, currentUserID int) (*UsageLeaderboardResponse, error) {
	now := time.Now()
	source, err := getUsageLeaderboardSource(period, now)
	if err != nil {
		return nil, err
	}
	username, err := model.GetUsernameById(currentUserID, false)
	if err != nil {
		return nil, err
	}

	tokenMetric := usageLeaderboardMetric{
		value:       func(total model.UsageLeaderboardTotal) int64 { return total.TotalTokens },
		bucketValue: func(bucket model.UsageLeaderboardBucket) int64 { return bucket.TotalTokens },
	}
	quotaMetric := usageLeaderboardMetric{
		value:       func(total model.UsageLeaderboardTotal) int64 { return total.TotalQuota },
		bucketValue: func(bucket model.UsageLeaderboardBucket) int64 { return bucket.TotalQuota },
	}

	return &UsageLeaderboardResponse{
		Period:     source.period.id,
		StartsAt:   source.period.start,
		EndsAt:     source.period.end,
		UpdatedAt:  source.updatedAt,
		TokenBoard: buildUsageLeaderboardBoard(source, currentUserID, username, tokenMetric),
		QuotaBoard: buildUsageLeaderboardBoard(source, currentUserID, username, quotaMetric),
	}, nil
}

func buildUsageLeaderboardBoard(source *usageLeaderboardSource, currentUserID int, currentUsername string, metric usageLeaderboardMetric) UsageLeaderboardBoard {
	ranked := rankUsageLeaderboardTotals(source.currentTotals, metric.value)
	previousRanks := usageLeaderboardRankMap(source.previousTotals, metric.value)
	board := UsageLeaderboardBoard{
		ActiveUsers: len(ranked),
		Top:         make([]UsageLeaderboardEntry, 0, minInt(len(ranked), usageLeaderboardLimit)),
	}
	for _, item := range ranked {
		board.Total += item.value
	}

	selfIndex := -1
	for index, item := range ranked {
		entry := usageLeaderboardEntry(item, board.Total, previousRanks, currentUserID)
		if index < usageLeaderboardLimit {
			board.Top = append(board.Top, entry)
		}
		if item.total.UserID == currentUserID {
			selfIndex = index
			board.Self = UsageLeaderboardSelf{
				UsageLeaderboardEntry: entry,
				Ranked:                true,
			}
		}
	}
	if len(board.Top) > 0 {
		champion := board.Top[0]
		board.Champion = &champion
	}
	if selfIndex < 0 {
		board.Self = UsageLeaderboardSelf{
			UsageLeaderboardEntry: UsageLeaderboardEntry{
				Username:  currentUsername,
				IsCurrent: true,
			},
			Ranked: false,
		}
	} else {
		applyUsageLeaderboardGaps(&board.Self, ranked, selfIndex)
	}
	if selfIndex < 0 && len(ranked) >= usageLeaderboardLimit {
		board.Self.GapToTopTen = ranked[usageLeaderboardLimit-1].value
	}

	trendUserIDs := usageLeaderboardTrendUserIDs(ranked, currentUserID)
	board.Trend = buildUsageLeaderboardTrend(source.buckets, ranked, trendUserIDs, currentUserID, metric.bucketValue)
	return board
}

func rankUsageLeaderboardTotals(totals []model.UsageLeaderboardTotal, value func(model.UsageLeaderboardTotal) int64) []usageLeaderboardRankedTotal {
	ranked := make([]usageLeaderboardRankedTotal, 0, len(totals))
	for _, total := range totals {
		metricValue := value(total)
		if metricValue <= 0 {
			continue
		}
		ranked = append(ranked, usageLeaderboardRankedTotal{total: total, value: metricValue})
	}
	sort.SliceStable(ranked, func(i int, j int) bool {
		if ranked[i].value == ranked[j].value {
			return ranked[i].total.Username < ranked[j].total.Username
		}
		return ranked[i].value > ranked[j].value
	})
	for index := range ranked {
		ranked[index].rank = index + 1
		if index > 0 && ranked[index].value == ranked[index-1].value {
			ranked[index].rank = ranked[index-1].rank
		}
	}
	return ranked
}

func usageLeaderboardEntry(item usageLeaderboardRankedTotal, total int64, previousRanks map[int]int, currentUserID int) UsageLeaderboardEntry {
	entry := UsageLeaderboardEntry{
		Rank:      item.rank,
		Username:  item.total.Username,
		IsCurrent: item.total.UserID == currentUserID,
		Value:     item.value,
	}
	if total > 0 {
		entry.Share = float64(item.value) / float64(total)
	}
	if previousRank, ok := previousRanks[item.total.UserID]; ok {
		entry.PreviousRank = &previousRank
		entry.RankDelta = previousRank - item.rank
	}
	return entry
}

func usageLeaderboardRankMap(totals []model.UsageLeaderboardTotal, value func(model.UsageLeaderboardTotal) int64) map[int]int {
	ranked := rankUsageLeaderboardTotals(totals, value)
	result := make(map[int]int, len(ranked))
	for _, item := range ranked {
		result[item.total.UserID] = item.rank
	}
	return result
}

func applyUsageLeaderboardGaps(self *UsageLeaderboardSelf, ranked []usageLeaderboardRankedTotal, selfIndex int) {
	selfValue := ranked[selfIndex].value
	if selfIndex > 0 {
		self.GapToPrevious = maxInt64(ranked[selfIndex-1].value-selfValue, 0)
	}
	if len(ranked) > 0 {
		self.GapToLeader = maxInt64(ranked[0].value-selfValue, 0)
	}
	if selfIndex >= usageLeaderboardLimit {
		self.GapToTopTen = maxInt64(ranked[usageLeaderboardLimit-1].value-selfValue, 0)
	}
	if len(ranked) > 1 {
		usersBelow := len(ranked) - selfIndex - 1
		self.SurpassedPercent = float64(usersBelow) / float64(len(ranked)-1) * 100
	}
}

func usageLeaderboardTrendUserIDs(ranked []usageLeaderboardRankedTotal, currentUserID int) []int {
	limit := minInt(len(ranked), usageLeaderboardTrendTop)
	ids := make([]int, 0, limit+1)
	seen := make(map[int]struct{}, limit+1)
	for index := 0; index < limit; index++ {
		id := ranked[index].total.UserID
		ids = append(ids, id)
		seen[id] = struct{}{}
	}
	for _, item := range ranked {
		if item.total.UserID == currentUserID {
			if _, ok := seen[currentUserID]; !ok {
				ids = append(ids, currentUserID)
			}
			break
		}
	}
	return ids
}

func buildUsageLeaderboardTrend(buckets []model.UsageLeaderboardBucket, ranked []usageLeaderboardRankedTotal, userIDs []int, currentUserID int, value func(model.UsageLeaderboardBucket) int64) []UsageLeaderboardTrendPoint {
	if len(userIDs) == 0 || len(buckets) == 0 {
		return []UsageLeaderboardTrendPoint{}
	}
	usernames := make(map[int]string, len(ranked))
	for _, item := range ranked {
		usernames[item.total.UserID] = item.total.Username
	}
	selected := make(map[int]struct{}, len(userIDs))
	for _, userID := range userIDs {
		selected[userID] = struct{}{}
	}
	bucketValues := make(map[int64]map[int]int64)
	bucketSet := make(map[int64]struct{})
	for _, bucket := range buckets {
		bucketSet[bucket.Bucket] = struct{}{}
		if _, ok := selected[bucket.UserID]; !ok {
			continue
		}
		if bucketValues[bucket.Bucket] == nil {
			bucketValues[bucket.Bucket] = make(map[int]int64)
		}
		bucketValues[bucket.Bucket][bucket.UserID] += value(bucket)
	}
	bucketOrder := make([]int64, 0, len(bucketSet))
	for bucket := range bucketSet {
		bucketOrder = append(bucketOrder, bucket)
	}
	sort.Slice(bucketOrder, func(i int, j int) bool { return bucketOrder[i] < bucketOrder[j] })

	cumulative := make(map[int]int64, len(userIDs))
	points := make([]UsageLeaderboardTrendPoint, 0, len(bucketOrder)*len(userIDs))
	for _, bucket := range bucketOrder {
		for _, userID := range userIDs {
			cumulative[userID] += bucketValues[bucket][userID]
			points = append(points, UsageLeaderboardTrendPoint{
				Bucket:    bucket,
				Username:  usernames[userID],
				IsCurrent: userID == currentUserID,
				Value:     cumulative[userID],
			})
		}
	}
	return points
}

func maxInt64(a int64, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
