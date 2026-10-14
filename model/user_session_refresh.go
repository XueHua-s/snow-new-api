package model

import (
	"crypto/hmac"
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// RotateUserSessionRefresh atomically rotates HMAC digests. The UPDATE itself
// is a compare-and-swap so SQLite, where lockForUpdate is intentionally a
// no-op, has the same single-winner behavior as MySQL and PostgreSQL. Only a
// recognized previous digest outside its grace window is treated as reuse;
// an unknown secret never revokes the victim session.
func RotateUserSessionRefresh(userID int, sid, presentedHash, nextHash string, now int64, grace time.Duration) (*UserSession, error) {
	if userID <= 0 || sid == "" || presentedHash == "" || nextHash == "" || hmac.Equal([]byte(presentedHash), []byte(nextHash)) {
		return nil, ErrUserSessionInvalid
	}
	if now <= 0 {
		now = time.Now().Unix()
	}
	graceSeconds := int64(grace / time.Second)
	if graceSeconds < 0 {
		return nil, ErrUserSessionInvalid
	}
	for range 3 {
		cacheDeadline := userSessionCacheDeadline()
		var session UserSession
		if err := DB.Where("sid = ? AND user_id = ?", sid, userID).First(&session).Error; err != nil {
			return nil, err
		}
		if session.Status != UserSessionStatusActive || session.RevokedAt != 0 || session.ExpiresAt <= now {
			return nil, ErrUserSessionInactive
		}

		if hmac.Equal([]byte(session.RefreshHash), []byte(presentedHash)) {
			result := DB.Model(&UserSession{}).
				Where("sid = ? AND user_id = ? AND status = ? AND revoked_at = ? AND expires_at > ? AND refresh_hash = ?",
					sid, userID, UserSessionStatusActive, 0, now, presentedHash).
				Updates(map[string]interface{}{
					"previous_refresh_hash": session.RefreshHash,
					"previous_valid_until":  now + graceSeconds,
					"refresh_hash":          nextHash,
					"last_active_at":        now,
				})
			if result.Error != nil {
				return nil, result.Error
			}
			if result.RowsAffected == 0 {
				continue
			}
			session.PreviousRefreshHash = session.RefreshHash
			session.PreviousValidUntil = now + graceSeconds
			session.RefreshHash = nextHash
			session.LastActiveAt = now
			if err := writeUserSessionCache(session.cacheEntry(), cacheDeadline); err != nil {
				if errors.Is(err, errUserSessionCacheObservationStale) {
					if confirmErr := confirmUserSessionActiveSnapshot(&session); confirmErr != nil {
						return nil, confirmErr
					}
				} else if errors.Is(err, ErrUserSessionInactive) {
					return nil, err
				} else {
					common.SysLog("failed to update rotated user session cache: " + err.Error())
				}
			}
			return &session, nil
		}

		if session.PreviousRefreshHash == "" || !hmac.Equal([]byte(session.PreviousRefreshHash), []byte(presentedHash)) {
			return nil, ErrUserSessionRefreshInvalid
		}
		if now <= session.PreviousValidUntil {
			return &session, ErrUserSessionRefreshRace
		}

		// Once a known previous token is replayed outside the grace window the
		// whole token family is compromised. Publish the deny fence first, then
		// revoke the active row regardless of a concurrent refresh rotation.
		if err := writeUserSessionDenyFence(&session, UserSessionStatusRevoking, now, "refresh_reuse"); err != nil {
			return nil, err
		}
		result := DB.Model(&UserSession{}).
			Where("sid = ? AND user_id = ? AND status = ? AND revoked_at = ? AND expires_at > ?",
				sid, userID, UserSessionStatusActive, 0, now).
			Updates(map[string]interface{}{
				"status":         UserSessionStatusRevoked,
				"revoked_at":     now,
				"revoked_reason": "refresh_reuse",
			})
		if result.Error != nil {
			return nil, result.Error
		}
		if result.RowsAffected == 0 {
			return nil, ErrUserSessionInactive
		}
		session.Status = UserSessionStatusRevoked
		session.RevokedAt = now
		session.RevokedReason = "refresh_reuse"
		if err := writeUserSessionCache(session.cacheEntry(), time.Time{}); err != nil {
			common.SysLog("failed to cache refresh-reuse session revoke: " + err.Error())
		}
		return nil, ErrUserSessionRefreshReuse
	}
	return nil, ErrUserSessionRefreshInvalid
}

// AdvanceUserSessionAuthVersion preserves one browser session across a
// user-level security-version change. Both old access JWTs and concurrent
// updates are invalidated by advancing the per-session version as well.
func AdvanceUserSessionAuthVersion(userID int, sid string, expectedSessionVersion, expectedUserAuthVersion, nextUserAuthVersion int64) (*UserSession, error) {
	if userID <= 0 || sid == "" || expectedSessionVersion <= 0 || expectedUserAuthVersion <= 0 || nextUserAuthVersion <= expectedUserAuthVersion {
		return nil, ErrUserSessionInvalid
	}
	cacheDeadline := userSessionCacheDeadline()
	now := time.Now().Unix()
	var session UserSession
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("sid = ? AND user_id = ?", sid, userID).First(&session).Error; err != nil {
			return err
		}
		if session.Status != UserSessionStatusActive || session.ExpiresAt <= now ||
			session.Version != expectedSessionVersion || session.UserAuthVersion != expectedUserAuthVersion {
			return ErrUserSessionInactive
		}
		session.Version++
		session.UserAuthVersion = nextUserAuthVersion
		session.LastActiveAt = now
		result := tx.Model(&UserSession{}).
			Where("sid = ? AND status = ? AND version = ? AND user_auth_version = ?", sid, UserSessionStatusActive, expectedSessionVersion, expectedUserAuthVersion).
			Updates(map[string]interface{}{
				"version":           session.Version,
				"user_auth_version": session.UserAuthVersion,
				"last_active_at":    session.LastActiveAt,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrUserSessionInactive
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if err := writeUserSessionCache(session.cacheEntry(), cacheDeadline); err != nil {
		if errors.Is(err, errUserSessionCacheObservationStale) {
			if confirmErr := confirmUserSessionActiveSnapshot(&session); confirmErr != nil {
				return nil, confirmErr
			}
		} else {
			return nil, err
		}
	}
	return &session, nil
}
