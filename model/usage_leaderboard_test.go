package model

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestUsageLeaderboardBucketExprQualifiesCreatedAt(t *testing.T) {
	originalUsingMySQL := common.UsingMySQL
	t.Cleanup(func() { common.UsingMySQL = originalUsingMySQL })

	for _, usingMySQL := range []bool{false, true} {
		common.UsingMySQL = usingMySQL
		expression := usageLeaderboardBucketExpr(7200, 8*3600)
		if !strings.Contains(expression, "quota_data.created_at") {
			t.Fatalf("bucket expression must qualify created_at, got %q", expression)
		}
	}
}
