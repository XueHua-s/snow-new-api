package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type UsageLeaderboardTotal struct {
	UserID       int    `json:"-"`
	Username     string `json:"username"`
	TotalTokens  int64  `json:"total_tokens"`
	TotalQuota   int64  `json:"total_quota"`
	RequestCount int64  `json:"request_count"`
}

type UsageLeaderboardBucket struct {
	UserID      int    `json:"-"`
	Username    string `json:"username"`
	Bucket      int64  `json:"bucket"`
	TotalTokens int64  `json:"total_tokens"`
	TotalQuota  int64  `json:"total_quota"`
}

func GetUsageLeaderboardTotals(startTime int64, endTime int64) ([]UsageLeaderboardTotal, error) {
	var rows []UsageLeaderboardTotal
	query := DB.Table("quota_data").
		Select("quota_data.user_id, users.username, sum(quota_data.token_used) as total_tokens, sum(quota_data.quota) as total_quota, sum(quota_data.count) as request_count").
		Joins("JOIN users ON users.id = quota_data.user_id").
		Where("users.deleted_at IS NULL").
		Where("users.status = ?", common.UserStatusEnabled).
		Group("quota_data.user_id, users.username").
		Having("sum(quota_data.token_used) > 0 OR sum(quota_data.quota) > 0")
	query = applyUsageLeaderboardTimeRange(query, startTime, endTime)
	err := query.Find(&rows).Error
	return rows, err
}

func GetUsageLeaderboardBuckets(startTime int64, endTime int64, bucketSize int64, timezoneOffset int64) ([]UsageLeaderboardBucket, error) {
	if bucketSize <= 0 {
		bucketSize = 2 * 3600
	}
	bucketExpr := usageLeaderboardBucketExpr(bucketSize, timezoneOffset)
	var rows []UsageLeaderboardBucket
	query := DB.Table("quota_data").
		Select(fmt.Sprintf("quota_data.user_id, users.username, %s as bucket, sum(quota_data.token_used) as total_tokens, sum(quota_data.quota) as total_quota", bucketExpr)).
		Joins("JOIN users ON users.id = quota_data.user_id").
		Where("users.deleted_at IS NULL").
		Where("users.status = ?", common.UserStatusEnabled).
		Group(fmt.Sprintf("quota_data.user_id, users.username, %s", bucketExpr)).
		Having("sum(quota_data.token_used) > 0 OR sum(quota_data.quota) > 0").
		Order("bucket ASC")
	query = applyUsageLeaderboardTimeRange(query, startTime, endTime)
	err := query.Find(&rows).Error
	return rows, err
}

func usageLeaderboardBucketExpr(bucketSize int64, timezoneOffset int64) string {
	if common.UsingMySQL {
		return fmt.Sprintf("FLOOR((quota_data.created_at + %d) / %d) * %d - %d", timezoneOffset, bucketSize, bucketSize, timezoneOffset)
	}
	return fmt.Sprintf("((quota_data.created_at + %d) / %d) * %d - %d", timezoneOffset, bucketSize, bucketSize, timezoneOffset)
}

func applyUsageLeaderboardTimeRange(query *gorm.DB, startTime int64, endTime int64) *gorm.DB {
	if startTime > 0 {
		query = query.Where("quota_data.created_at >= ?", startTime)
	}
	if endTime > 0 {
		query = query.Where("quota_data.created_at < ?", endTime)
	}
	return query
}
