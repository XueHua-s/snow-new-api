package model

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	BatchUpdateTypeUserQuota = iota
	BatchUpdateTypeTokenQuota
	BatchUpdateTypeUsedQuota
	BatchUpdateTypeChannelUsedQuota
	BatchUpdateTypeRequestCount
	BatchUpdateTypeCount // if you add a new type, you need to add a new map and a new lock
)

var batchUpdateStores []map[int]int
var batchUpdateLocks []sync.Mutex

func init() {
	for i := 0; i < BatchUpdateTypeCount; i++ {
		batchUpdateStores = append(batchUpdateStores, make(map[int]int))
		batchUpdateLocks = append(batchUpdateLocks, sync.Mutex{})
	}
}

var batchFlushGate = make(chan struct{}, 1)
var batchUpdaterMu sync.Mutex
var batchUpdaterCancel context.CancelFunc
var batchUpdaterDone chan struct{}

func InitBatchUpdater() {
	batchUpdaterMu.Lock()
	defer batchUpdaterMu.Unlock()
	if batchUpdaterCancel != nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	batchUpdaterCancel, batchUpdaterDone = cancel, done
	go func() {
		defer close(done)
		ticker := time.NewTicker(time.Duration(max(1, common.BatchUpdateInterval)) * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				// Stop only the scheduler. Never cancel an additive SQL update
				// and then replay it because its commit outcome is unknown.
				if err := flushBatchUpdates(context.Background()); err != nil {
					common.SysLog("failed to flush batch updates: " + err.Error())
				}
			}
		}
	}()
}

// ShutdownBatchUpdater is called after admitted relay handlers have settled.
// Stop scheduling and wait for the current SQL cycle before the final flush.
// Failed additive writes are never replayed: their commit outcome may be unknown.
// The caller must report a failed final flush and reconcile database errors.
func ShutdownBatchUpdater(ctx context.Context) error {
	batchUpdaterMu.Lock()
	cancel, done := batchUpdaterCancel, batchUpdaterDone
	if cancel != nil {
		cancel()
	}
	batchUpdaterMu.Unlock()
	if done != nil {
		select {
		case <-done:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return flushBatchUpdates(ctx)
}

func addNewRecord(type_ int, id int, value int) {
	batchUpdateLocks[type_].Lock()
	defer batchUpdateLocks[type_].Unlock()
	if _, ok := batchUpdateStores[type_][id]; !ok {
		batchUpdateStores[type_][id] = value
	} else {
		batchUpdateStores[type_][id] += value
	}
}

func batchUpdate() {
	if err := flushBatchUpdates(context.Background()); err != nil {
		common.SysLog("failed to flush batch updates: " + err.Error())
	}
}

func flushBatchUpdates(ctx context.Context) error {
	select {
	case batchFlushGate <- struct{}{}:
	case <-ctx.Done():
		return ctx.Err()
	}
	defer func() { <-batchFlushGate }()
	var flushErrors []error
	db := DB.WithContext(ctx)
	// check if there's any data to update
	hasData := false
	for i := 0; i < BatchUpdateTypeCount; i++ {
		batchUpdateLocks[i].Lock()
		if len(batchUpdateStores[i]) > 0 {
			hasData = true
			batchUpdateLocks[i].Unlock()
			break
		}
		batchUpdateLocks[i].Unlock()
	}

	if !hasData {
		return nil
	}

	common.SysLog("batch update started")
	stores := make([]map[int]int, BatchUpdateTypeCount)
	for i := 0; i < BatchUpdateTypeCount; i++ {
		batchUpdateLocks[i].Lock()
		stores[i] = batchUpdateStores[i]
		batchUpdateStores[i] = make(map[int]int)
		batchUpdateLocks[i].Unlock()
	}

	for i, store := range stores {
		if i == BatchUpdateTypeUserQuota || i == BatchUpdateTypeUsedQuota || i == BatchUpdateTypeRequestCount {
			continue
		}
		for key, value := range store {
			switch i {
			case BatchUpdateTypeTokenQuota:
				err := increaseTokenQuotaInDB(db, key, value)
				if err != nil {
					flushErrors = append(flushErrors, fmt.Errorf("token quota update: %w", err))
				}
			case BatchUpdateTypeChannelUsedQuota:
				if err := updateChannelUsedQuotaInDB(db, key, value); err != nil {
					flushErrors = append(flushErrors, fmt.Errorf("channel quota update: %w", err))
				}
			}
		}
	}

	userQuotaStore := stores[BatchUpdateTypeUserQuota]
	usedQuotaStore := stores[BatchUpdateTypeUsedQuota]
	requestCountStore := stores[BatchUpdateTypeRequestCount]

	userIDs := make(map[int]struct{}, len(userQuotaStore)+len(usedQuotaStore)+len(requestCountStore))
	for key := range userQuotaStore {
		userIDs[key] = struct{}{}
	}
	for key := range usedQuotaStore {
		userIDs[key] = struct{}{}
	}
	for key := range requestCountStore {
		userIDs[key] = struct{}{}
	}
	for key := range userIDs {
		if err := updateUserQuotaUsedQuotaAndRequestCount(db, key, userQuotaStore[key], usedQuotaStore[key], requestCountStore[key]); err != nil {
			flushErrors = append(flushErrors, fmt.Errorf("user quota update: %w", err))
		}
	}
	flushError := errors.Join(flushErrors...)
	if flushError == nil {
		common.SysLog("batch update finished")
	}
	// Match periodic update semantics: never replay an additive SQL statement
	// after an error with a potentially ambiguous commit outcome.
	return flushError
}

func RecordExist(err error) (bool, error) {
	if err == nil {
		return true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	return false, err
}

func shouldUpdateRedis(fromDB bool, err error) bool {
	return common.RedisEnabled && fromDB && err == nil
}
