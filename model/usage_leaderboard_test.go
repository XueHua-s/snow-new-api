package model

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestUsageLeaderboardBucketExprQualifiesCreatedAt(t *testing.T) {
	originalDatabaseType := common.MainDatabaseType()
	t.Cleanup(func() { common.SetMainDatabaseType(originalDatabaseType) })

	for _, usingMySQL := range []bool{false, true} {
		if usingMySQL {
			common.SetMainDatabaseType(common.DatabaseTypeMySQL)
		} else {
			common.SetMainDatabaseType(common.DatabaseTypeSQLite)
		}
		expression := usageLeaderboardBucketExpr(7200, 8*3600)
		if !strings.Contains(expression, "quota_data.created_at") {
			t.Fatalf("bucket expression must qualify created_at, got %q", expression)
		}
	}
}
