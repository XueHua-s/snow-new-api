package model

import (
	"crypto/hmac"
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

func RevokeUserSession(userID int, sid, reason string) (bool, error) {
	if userID <= 0 || sid == "" {
		return false, ErrUserSessionInvalid
	}
	now := time.Now().Unix()
	var candidate UserSession
	if err := DB.Where("sid = ? AND user_id = ?", sid, userID).First(&candidate).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	if candidate.Status != UserSessionStatusActive || candidate.RevokedAt != 0 || candidate.ExpiresAt <= now {
		return false, nil
	}
	if err := writeUserSessionDenyFence(&candidate, UserSessionStatusRevoking, now, reason); err != nil {
		return false, err
	}

	var revoked bool
	err := DB.Transaction(func(tx *gorm.DB) error {
		var current UserSession
		if err := lockForUpdate(tx).Where("sid = ? AND user_id = ?", sid, userID).First(&current).Error; err != nil {
			return err
		}
		if current.Status != UserSessionStatusActive || current.RevokedAt != 0 || current.ExpiresAt <= now {
			return nil
		}
		result := tx.Model(&UserSession{}).Where("sid = ? AND status = ?", sid, UserSessionStatusActive).Updates(map[string]interface{}{
			"status":         UserSessionStatusRevoked,
			"revoked_at":     now,
			"revoked_reason": reason,
		})
		if result.Error != nil {
			return result.Error
		}
		revoked = result.RowsAffected == 1
		return nil
	})
	if err != nil {
		return false, err
	}
	if revoked {
		candidate.Status = UserSessionStatusRevoked
		candidate.RevokedAt = now
		candidate.RevokedReason = reason
		if err := writeUserSessionCache(candidate.cacheEntry(), time.Time{}); err != nil {
			common.SysLog("failed to finalize user session revoke tombstone: " + err.Error())
		}
	}
	return revoked, nil
}

// RevokeUserSessionByRefreshHash is used when logout is authenticated only by
// the HttpOnly refresh cookie. Possession of a SID alone is insufficient. The
// immediately previous digest is accepted only inside the refresh race window.
func RevokeUserSessionByRefreshHash(sid, presentedHash, reason string) (bool, error) {
	if sid == "" || presentedHash == "" {
		return false, ErrUserSessionInvalid
	}
	now := time.Now().Unix()
	var session UserSession
	var revoked bool
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("sid = ?", sid).First(&session).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		if session.Status != UserSessionStatusActive || session.RevokedAt != 0 || session.ExpiresAt <= now {
			return nil
		}
		validCurrent := hmac.Equal([]byte(session.RefreshHash), []byte(presentedHash))
		validPrevious := session.PreviousRefreshHash != "" && now <= session.PreviousValidUntil &&
			hmac.Equal([]byte(session.PreviousRefreshHash), []byte(presentedHash))
		if !validCurrent && !validPrevious {
			return nil
		}
		if err := writeUserSessionDenyFence(&session, UserSessionStatusRevoking, now, reason); err != nil {
			return err
		}
		result := tx.Model(&UserSession{}).Where("sid = ? AND status = ?", sid, UserSessionStatusActive).Updates(map[string]interface{}{
			"status":         UserSessionStatusRevoked,
			"revoked_at":     now,
			"revoked_reason": reason,
		})
		if result.Error != nil {
			return result.Error
		}
		revoked = result.RowsAffected == 1
		if revoked {
			session.Status = UserSessionStatusRevoked
			session.RevokedAt = now
			session.RevokedReason = reason
		}
		return nil
	})
	if err != nil {
		return false, err
	}
	if revoked {
		if err := writeUserSessionCache(session.cacheEntry(), time.Time{}); err != nil {
			common.SysLog("failed to finalize refresh-authenticated session revoke tombstone: " + err.Error())
		}
	}
	return revoked, nil
}

func RevokeOtherUserSessions(userID int, currentSID, reason string) (int64, error) {
	return revokeUserSessions(userID, currentSID, reason)
}

func RevokeAllUserSessions(userID int, reason string) (int64, error) {
	return revokeUserSessions(userID, "", reason)
}

func revokeUserSessions(userID int, excludedSID, reason string) (int64, error) {
	if userID <= 0 {
		return 0, ErrUserSessionInvalid
	}
	now := time.Now().Unix()
	var totalAffected int64
	for {
		query := DB.Where("user_id = ? AND status = ? AND expires_at > ?", userID, UserSessionStatusActive, now)
		if excludedSID != "" {
			query = query.Where("sid <> ?", excludedSID)
		}
		var candidates []UserSession
		if err := query.Order("sid").Limit(userSessionRevokeBatchSize).Find(&candidates).Error; err != nil {
			return totalAffected, err
		}
		if len(candidates) == 0 {
			return totalAffected, nil
		}
		for i := range candidates {
			if err := writeUserSessionDenyFence(&candidates[i], UserSessionStatusRevoking, now, reason); err != nil {
				return totalAffected, err
			}
		}

		sids := make([]string, 0, len(candidates))
		for i := range candidates {
			sids = append(sids, candidates[i].SID)
		}
		var affected int64
		var revoked []UserSession
		err := DB.Transaction(func(tx *gorm.DB) error {
			if err := lockForUpdate(tx).Where("sid IN ? AND status = ?", sids, UserSessionStatusActive).Find(&revoked).Error; err != nil {
				return err
			}
			if len(revoked) == 0 {
				return nil
			}
			lockedSIDs := make([]string, 0, len(revoked))
			for i := range revoked {
				lockedSIDs = append(lockedSIDs, revoked[i].SID)
			}
			result := tx.Model(&UserSession{}).Where("sid IN ? AND status = ?", lockedSIDs, UserSessionStatusActive).Updates(map[string]interface{}{
				"status":         UserSessionStatusRevoked,
				"revoked_at":     now,
				"revoked_reason": reason,
			})
			affected = result.RowsAffected
			return result.Error
		})
		if err != nil {
			return totalAffected, err
		}
		totalAffected += affected
		for i := range revoked {
			revoked[i].Status = UserSessionStatusRevoked
			revoked[i].RevokedAt = now
			revoked[i].RevokedReason = reason
			if err := writeUserSessionCache(revoked[i].cacheEntry(), time.Time{}); err != nil {
				common.SysLog("failed to finalize bulk user session revoke tombstone: " + err.Error())
			}
		}
	}
}

func DeleteExpiredUserSessions(now int64) error {
	if now <= 0 {
		now = time.Now().Unix()
	}
	if common.UserSessionRevokedRetentionDays <= 0 || common.UserSessionIssuanceWindowSeconds <= 0 {
		return ErrUserSessionInvalid
	}
	issuanceCutoff := now - common.UserSessionIssuanceWindowSeconds
	revokedBefore := now - int64(common.UserSessionRevokedRetentionDays)*24*60*60
	return deleteExpiredUserSessionsBefore(now, issuanceCutoff, revokedBefore)
}

func DeleteOldRevokedUserSessions(now int64) error {
	if now <= 0 {
		now = time.Now().Unix()
	}
	if common.UserSessionRevokedRetentionDays <= 0 || common.UserSessionIssuanceWindowSeconds <= 0 {
		return ErrUserSessionInvalid
	}
	issuanceCutoff := now - common.UserSessionIssuanceWindowSeconds
	revokedBefore := now - int64(common.UserSessionRevokedRetentionDays)*24*60*60
	return deleteRevokedUserSessionsBefore(revokedBefore, issuanceCutoff)
}

func deleteExpiredUserSessionsBefore(expiredBefore, issuanceCutoff, revokedBefore int64) error {
	for {
		var sids []string
		if err := DB.Model(&UserSession{}).
			Where(
				"expires_at < ? AND created_at <= ? AND (status <> ? OR revoked_at <= 0 OR revoked_at < ?)",
				expiredBefore,
				issuanceCutoff,
				UserSessionStatusRevoked,
				revokedBefore,
			).
			Order("expires_at").Limit(userSessionCleanupScanLimit).Pluck("sid", &sids).Error; err != nil {
			return err
		}
		if len(sids) == 0 {
			return nil
		}
		for start := 0; start < len(sids); start += userSessionCleanupBatchSize {
			end := start + userSessionCleanupBatchSize
			if end > len(sids) {
				end = len(sids)
			}
			if err := DB.Where("sid IN ?", sids[start:end]).
				Where(
					"expires_at < ? AND created_at <= ? AND (status <> ? OR revoked_at <= 0 OR revoked_at < ?)",
					expiredBefore,
					issuanceCutoff,
					UserSessionStatusRevoked,
					revokedBefore,
				).
				Delete(&UserSession{}).Error; err != nil {
				return err
			}
		}
	}
}

func deleteRevokedUserSessionsBefore(revokedBefore, issuanceCutoff int64) error {
	for {
		var sids []string
		if err := DB.Model(&UserSession{}).
			Where(
				"status = ? AND revoked_at > 0 AND revoked_at < ? AND created_at <= ?",
				UserSessionStatusRevoked,
				revokedBefore,
				issuanceCutoff,
			).
			Order("revoked_at").Limit(userSessionCleanupScanLimit).Pluck("sid", &sids).Error; err != nil {
			return err
		}
		if len(sids) == 0 {
			return nil
		}
		for start := 0; start < len(sids); start += userSessionCleanupBatchSize {
			end := start + userSessionCleanupBatchSize
			if end > len(sids) {
				end = len(sids)
			}
			if err := DB.Where("sid IN ?", sids[start:end]).
				Where(
					"status = ? AND revoked_at > 0 AND revoked_at < ? AND created_at <= ?",
					UserSessionStatusRevoked,
					revokedBefore,
					issuanceCutoff,
				).
				Delete(&UserSession{}).Error; err != nil {
				return err
			}
		}
	}
}
