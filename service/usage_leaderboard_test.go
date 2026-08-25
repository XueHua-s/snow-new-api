package service

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
)

func TestBuildUsageLeaderboardPeriodUsesShanghaiCalendarBoundaries(t *testing.T) {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, time.August, 25, 17, 30, 0, 0, location)

	day, err := buildUsageLeaderboardPeriod("day", now)
	if err != nil {
		t.Fatal(err)
	}
	if got := time.Unix(day.start, 0).In(location); !got.Equal(time.Date(2026, time.August, 25, 0, 0, 0, 0, location)) {
		t.Fatalf("unexpected day start: %s", got)
	}

	week, err := buildUsageLeaderboardPeriod("week", now)
	if err != nil {
		t.Fatal(err)
	}
	if got := time.Unix(week.start, 0).In(location); !got.Equal(time.Date(2026, time.August, 24, 0, 0, 0, 0, location)) {
		t.Fatalf("unexpected week start: %s", got)
	}
}

func TestBuildUsageLeaderboardPeriodRejectsUnknownPeriod(t *testing.T) {
	_, err := buildUsageLeaderboardPeriod("quarter", time.Now())
	if !errors.Is(err, ErrInvalidUsageLeaderboardPeriod) {
		t.Fatalf("expected invalid period error, got %v", err)
	}
}

func TestCachedUsageLeaderboardSourceDoesNotCrossCalendarBoundary(t *testing.T) {
	now := time.Now()
	usageLeaderboardCacheMu.Lock()
	originalCache := usageLeaderboardCache
	usageLeaderboardCache = map[string]usageLeaderboardCacheItem{
		"day": {
			expiresAt: now.Add(time.Minute),
			source: &usageLeaderboardSource{
				period: usageLeaderboardPeriod{id: "day", start: 100},
			},
		},
	}
	usageLeaderboardCacheMu.Unlock()
	t.Cleanup(func() {
		usageLeaderboardCacheMu.Lock()
		usageLeaderboardCache = originalCache
		usageLeaderboardCacheMu.Unlock()
	})

	config := usageLeaderboardPeriod{id: "day", start: 200}
	if source := cachedUsageLeaderboardSource(config, now); source != nil {
		t.Fatal("a cached snapshot from the previous day must not be reused")
	}
}

func TestBuildUsageLeaderboardBoardLimitsPublicRowsAndPinsSelf(t *testing.T) {
	totals := make([]model.UsageLeaderboardTotal, 0, 12)
	for index := 1; index <= 12; index++ {
		totals = append(totals, model.UsageLeaderboardTotal{
			UserID:       index,
			Username:     fmt.Sprintf("user-%02d", index),
			TotalTokens:  int64((13 - index) * 100),
			TotalQuota:   int64((13 - index) * 10),
			RequestCount: int64(index),
		})
	}
	source := &usageLeaderboardSource{currentTotals: totals}
	metric := usageLeaderboardMetric{
		value:       func(total model.UsageLeaderboardTotal) int64 { return total.TotalTokens },
		bucketValue: func(bucket model.UsageLeaderboardBucket) int64 { return bucket.TotalTokens },
	}

	board := buildUsageLeaderboardBoard(source, 12, "user-12", metric)
	if len(board.Top) != usageLeaderboardLimit {
		t.Fatalf("expected %d public rows, got %d", usageLeaderboardLimit, len(board.Top))
	}
	if board.Top[0].Username != "user-01" || board.Top[9].Username != "user-10" {
		t.Fatalf("unexpected top rows: first=%s tenth=%s", board.Top[0].Username, board.Top[9].Username)
	}
	if !board.Self.Ranked || board.Self.Rank != 12 || board.Self.Username != "user-12" {
		t.Fatalf("unexpected self row: %+v", board.Self)
	}
	if board.Self.GapToTopTen != 200 {
		t.Fatalf("expected top-ten gap 200, got %d", board.Self.GapToTopTen)
	}
}

func TestRankUsageLeaderboardTotalsKeepsTies(t *testing.T) {
	totals := []model.UsageLeaderboardTotal{
		{UserID: 1, Username: "alpha", TotalTokens: 100},
		{UserID: 2, Username: "beta", TotalTokens: 100},
		{UserID: 3, Username: "gamma", TotalTokens: 50},
	}
	ranked := rankUsageLeaderboardTotals(totals, func(total model.UsageLeaderboardTotal) int64 {
		return total.TotalTokens
	})
	if ranked[0].rank != 1 || ranked[1].rank != 1 || ranked[2].rank != 3 {
		t.Fatalf("unexpected ranks: %d, %d, %d", ranked[0].rank, ranked[1].rank, ranked[2].rank)
	}
}

func TestBuildUsageLeaderboardTrendPinsCurrentUserOutsideTopFive(t *testing.T) {
	totals := make([]model.UsageLeaderboardTotal, 0, 6)
	buckets := make([]model.UsageLeaderboardBucket, 0, 12)
	for userID := 1; userID <= 6; userID++ {
		totals = append(totals, model.UsageLeaderboardTotal{
			UserID:      userID,
			Username:    fmt.Sprintf("user-%d", userID),
			TotalTokens: int64(700 - userID*100),
		})
		buckets = append(buckets,
			model.UsageLeaderboardBucket{UserID: userID, Username: fmt.Sprintf("user-%d", userID), Bucket: 100, TotalTokens: int64(userID)},
			model.UsageLeaderboardBucket{UserID: userID, Username: fmt.Sprintf("user-%d", userID), Bucket: 200, TotalTokens: int64(userID)},
		)
	}
	ranked := rankUsageLeaderboardTotals(totals, func(total model.UsageLeaderboardTotal) int64 {
		return total.TotalTokens
	})
	userIDs := usageLeaderboardTrendUserIDs(ranked, 6)
	points := buildUsageLeaderboardTrend(
		buckets,
		ranked,
		userIDs,
		6,
		func(bucket model.UsageLeaderboardBucket) int64 { return bucket.TotalTokens },
	)

	if len(userIDs) != 6 || userIDs[5] != 6 {
		t.Fatalf("expected current user appended after top five, got %v", userIDs)
	}
	last := points[len(points)-1]
	if !last.IsCurrent || last.Username != "user-6" || last.Value != 12 {
		t.Fatalf("unexpected pinned current-user trend point: %+v", last)
	}
}
