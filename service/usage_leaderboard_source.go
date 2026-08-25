package service

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/model"
	"golang.org/x/sync/singleflight"
)

const usageLeaderboardCacheTTL = time.Minute

var ErrInvalidUsageLeaderboardPeriod = errors.New("invalid usage leaderboard period")

type usageLeaderboardPeriod struct {
	id             string
	start          int64
	end            int64
	previousStart  int64
	previousEnd    int64
	bucketSize     int64
	timezoneOffset int64
	hasPrevious    bool
}

type usageLeaderboardSource struct {
	period         usageLeaderboardPeriod
	updatedAt      int64
	currentTotals  []model.UsageLeaderboardTotal
	previousTotals []model.UsageLeaderboardTotal
	buckets        []model.UsageLeaderboardBucket
}

type usageLeaderboardCacheItem struct {
	expiresAt time.Time
	source    *usageLeaderboardSource
}

var (
	usageLeaderboardCacheMu sync.RWMutex
	usageLeaderboardCache   = map[string]usageLeaderboardCacheItem{}
	usageLeaderboardLoads   singleflight.Group
)

func getUsageLeaderboardSource(period string, now time.Time) (*usageLeaderboardSource, error) {
	config, err := buildUsageLeaderboardPeriod(period, now)
	if err != nil {
		return nil, err
	}
	if source := cachedUsageLeaderboardSource(config, now); source != nil {
		return source, nil
	}

	// Include the calendar boundary so a request after midnight never joins an
	// in-flight load for the previous day.
	loadKey := fmt.Sprintf("%s:%d", config.id, config.start)
	loaded, err, _ := usageLeaderboardLoads.Do(loadKey, func() (interface{}, error) {
		if source := cachedUsageLeaderboardSource(config, now); source != nil {
			return source, nil
		}
		return loadUsageLeaderboardSource(config, now)
	})
	if err != nil {
		return nil, err
	}
	return loaded.(*usageLeaderboardSource), nil
}

func cachedUsageLeaderboardSource(config usageLeaderboardPeriod, now time.Time) *usageLeaderboardSource {
	usageLeaderboardCacheMu.RLock()
	item, ok := usageLeaderboardCache[config.id]
	usageLeaderboardCacheMu.RUnlock()
	if !ok || !now.Before(item.expiresAt) || item.source.period.start != config.start {
		return nil
	}
	return item.source
}

func loadUsageLeaderboardSource(config usageLeaderboardPeriod, now time.Time) (*usageLeaderboardSource, error) {
	currentTotals, err := model.GetUsageLeaderboardTotals(config.start, config.end)
	if err != nil {
		return nil, err
	}
	buckets, err := model.GetUsageLeaderboardBuckets(
		config.start,
		config.end,
		config.bucketSize,
		config.timezoneOffset,
	)
	if err != nil {
		return nil, err
	}

	var previousTotals []model.UsageLeaderboardTotal
	if config.hasPrevious {
		previousTotals, err = model.GetUsageLeaderboardTotals(config.previousStart, config.previousEnd)
		if err != nil {
			return nil, err
		}
	}

	source := &usageLeaderboardSource{
		period:         config,
		updatedAt:      now.Unix(),
		currentTotals:  currentTotals,
		previousTotals: previousTotals,
		buckets:        buckets,
	}
	usageLeaderboardCacheMu.Lock()
	usageLeaderboardCache[config.id] = usageLeaderboardCacheItem{
		expiresAt: now.Add(usageLeaderboardCacheTTL),
		source:    source,
	}
	usageLeaderboardCacheMu.Unlock()
	return source, nil
}

func buildUsageLeaderboardPeriod(period string, now time.Time) (usageLeaderboardPeriod, error) {
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		location = time.FixedZone("Asia/Shanghai", 8*3600)
	}
	localNow := now.In(location)
	dayStart := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, location)
	_, timezoneOffset := localNow.Zone()

	config := usageLeaderboardPeriod{
		id:             period,
		end:            localNow.Unix() + 1,
		timezoneOffset: int64(timezoneOffset),
		hasPrevious:    true,
	}
	switch period {
	case "", "day":
		config.id = "day"
		config.start = dayStart.Unix()
		config.bucketSize = 2 * 3600
	case "week":
		weekdayOffset := (int(dayStart.Weekday()) + 6) % 7
		config.start = dayStart.AddDate(0, 0, -weekdayOffset).Unix()
		config.bucketSize = 24 * 3600
	case "month":
		config.start = time.Date(localNow.Year(), localNow.Month(), 1, 0, 0, 0, 0, location).Unix()
		config.bucketSize = 24 * 3600
	case "year":
		config.start = time.Date(localNow.Year(), 1, 1, 0, 0, 0, 0, location).Unix()
		config.bucketSize = 30 * 24 * 3600
	case "all":
		config.start = 0
		config.bucketSize = 30 * 24 * 3600
		config.hasPrevious = false
	default:
		return usageLeaderboardPeriod{}, fmt.Errorf("%w: %s", ErrInvalidUsageLeaderboardPeriod, period)
	}

	if config.hasPrevious {
		elapsed := config.end - config.start
		config.previousEnd = config.start
		config.previousStart = config.start - elapsed
	}
	return config, nil
}
