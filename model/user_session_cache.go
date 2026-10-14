package model

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
)

type userSessionCacheEntry struct {
	SID             string
	UserID          int
	Version         int64
	UserAuthVersion int64
	Status          string
	LoginMethod     string
	IP              string
	UserAgent       string
	CreatedAt       int64
	LastActiveAt    int64
	ExpiresAt       int64
	RevokedAt       int64
	RevokedReason   string
	CacheSchema     int
}

func (session *UserSession) cacheEntry() *userSessionCacheEntry {
	return &userSessionCacheEntry{
		SID:             session.SID,
		UserID:          session.UserID,
		Version:         session.Version,
		UserAuthVersion: session.UserAuthVersion,
		Status:          session.Status,
		LoginMethod:     session.LoginMethod,
		IP:              session.IP,
		UserAgent:       session.UserAgent,
		CreatedAt:       session.CreatedAt,
		LastActiveAt:    session.LastActiveAt,
		ExpiresAt:       session.ExpiresAt,
		RevokedAt:       session.RevokedAt,
		RevokedReason:   session.RevokedReason,
		CacheSchema:     userSessionCacheSchema,
	}
}

func (entry *userSessionCacheEntry) session() *UserSession {
	return &UserSession{
		SID:             entry.SID,
		UserID:          entry.UserID,
		Version:         entry.Version,
		UserAuthVersion: entry.UserAuthVersion,
		Status:          entry.Status,
		LoginMethod:     entry.LoginMethod,
		IP:              entry.IP,
		UserAgent:       entry.UserAgent,
		CreatedAt:       entry.CreatedAt,
		LastActiveAt:    entry.LastActiveAt,
		ExpiresAt:       entry.ExpiresAt,
		RevokedAt:       entry.RevokedAt,
		RevokedReason:   entry.RevokedReason,
	}
}

func userSessionCacheKey(sid string) string {
	digest := common.GenerateHMACWithKey([]byte("user-session-cache-v1:"+common.SessionSecret), sid)
	return "auth:session:" + digest
}

func userSessionCacheDeadline() time.Time {
	return time.Now().Add(time.Duration(userCacheTTLSeconds()) * time.Second)
}

// GetUserSessionCached validates cached state first and falls back to the
// database on a miss or Redis read failure. A deny tombstone never falls back.
func GetUserSessionCached(sid string) (*UserSession, error) {
	if sid == "" {
		return nil, ErrUserSessionInvalid
	}
	if common.RedisEnabled {
		entry, err := getUserSessionCache(sid)
		if err == nil {
			return entry.session(), nil
		}
		if errors.Is(err, ErrUserSessionInactive) {
			return nil, err
		}
	}

	cacheDeadline := userSessionCacheDeadline()
	session, err := GetUserSessionBySID(sid)
	if err != nil {
		return nil, err
	}
	now := time.Now().Unix()
	if session.Status != UserSessionStatusActive || session.RevokedAt != 0 || session.ExpiresAt <= now {
		if common.RedisEnabled {
			entry := session.cacheEntry()
			entry.Status = UserSessionStatusRevoked
			_ = writeUserSessionCache(entry, time.Time{})
		}
		return nil, ErrUserSessionInactive
	}
	if common.RedisEnabled {
		if err := writeUserSessionCache(session.cacheEntry(), cacheDeadline); err != nil {
			if errors.Is(err, errUserSessionCacheObservationStale) {
				if confirmErr := confirmUserSessionActiveSnapshot(session); confirmErr != nil {
					return nil, confirmErr
				}
				return session, nil
			}
			if errors.Is(err, ErrUserSessionInactive) {
				return nil, err
			}
			common.SysLog("failed to synchronously populate user session cache: " + err.Error())
		}
	}
	return session, nil
}

func getUserSessionCache(sid string) (*userSessionCacheEntry, error) {
	var entry userSessionCacheEntry
	if err := common.RedisHGetObj(userSessionCacheKey(sid), &entry); err != nil {
		return nil, err
	}
	if entry.CacheSchema != userSessionCacheSchema || entry.SID != sid || entry.UserID <= 0 || entry.Version <= 0 || entry.UserAuthVersion <= 0 {
		return nil, fmt.Errorf("user session cache schema is stale")
	}
	if entry.Status != UserSessionStatusActive || entry.RevokedAt != 0 || entry.ExpiresAt <= time.Now().Unix() {
		return nil, ErrUserSessionInactive
	}
	return &entry, nil
}

// writeUserSessionCache writes a bounded Session snapshot. Active snapshots
// must carry a deadline captured immediately before their authoritative
// database read or mutation. Delayed fills inherit the unspent portion of that
// window, so a stale active snapshot cannot outlive a short deny tombstone and
// reactivate a revoked Session after the tombstone expires. Deny states pass a
// zero deadline because their TTL starts when they are published.
func writeUserSessionCache(entry *userSessionCacheEntry, cacheDeadline time.Time) error {
	if entry == nil || !common.RedisEnabled {
		return nil
	}
	now := time.Now()
	sessionExpiresAt := time.Unix(entry.ExpiresAt, 0)
	sessionTTL := sessionExpiresAt.Sub(now)
	var redisExpiration int64
	if entry.Status == UserSessionStatusActive {
		if cacheDeadline.IsZero() {
			return ErrUserSessionInvalid
		}
		cacheTTL := cacheDeadline.Sub(now)
		if cacheTTL <= 0 {
			return errUserSessionCacheObservationStale
		}
		if sessionTTL <= 0 {
			return ErrUserSessionInactive
		}
		cacheExpiresAt := cacheDeadline
		if sessionExpiresAt.Before(cacheExpiresAt) {
			cacheExpiresAt = sessionExpiresAt
		}
		if cacheExpiresAt.Sub(now) < time.Millisecond {
			return errUserSessionCacheObservationStale
		}
		redisExpiration = cacheExpiresAt.UnixMilli()
	} else {
		ttl := min(sessionTTL, time.Duration(userCacheTTLSeconds())*time.Second)
		if ttl <= 0 {
			ttl = time.Second
		}
		redisExpiration = ttl.Milliseconds()
		if redisExpiration <= 0 {
			redisExpiration = 1
		}
	}
	entry.CacheSchema = userSessionCacheSchema
	const script = `
local current_status = redis.call('HGET', KEYS[1], 'Status')
local current_version = tonumber(redis.call('HGET', KEYS[1], 'Version') or '0')
if ARGV[5] == 'active' and (current_status == 'revoking' or current_status == 'revoked') then
  return 0
end
if current_version > tonumber(ARGV[3]) then
  return 0
end
redis.call('HSET', KEYS[1],
  'SID', ARGV[1], 'UserID', ARGV[2], 'Version', ARGV[3],
  'UserAuthVersion', ARGV[4], 'Status', ARGV[5],
  'LoginMethod', ARGV[6], 'IP', ARGV[7], 'UserAgent', ARGV[8],
  'CreatedAt', ARGV[9], 'LastActiveAt', ARGV[10], 'ExpiresAt', ARGV[11],
  'RevokedAt', ARGV[12], 'RevokedReason', ARGV[13], 'CacheSchema', ARGV[14])
if ARGV[5] == 'active' then
  redis.call('PEXPIREAT', KEYS[1], ARGV[15])
else
  redis.call('PEXPIRE', KEYS[1], ARGV[15])
end
return 1`
	result, err := common.RDB.Eval(context.Background(), script, []string{userSessionCacheKey(entry.SID)},
		entry.SID, entry.UserID, entry.Version, entry.UserAuthVersion, entry.Status,
		entry.LoginMethod, entry.IP, entry.UserAgent, entry.CreatedAt, entry.LastActiveAt,
		entry.ExpiresAt, entry.RevokedAt, entry.RevokedReason, entry.CacheSchema, redisExpiration,
	).Int()
	if err != nil {
		return err
	}
	if result == 0 {
		return ErrUserSessionInactive
	}
	if entry.Status == UserSessionStatusActive {
		completedAt := time.Now()
		if !completedAt.Before(cacheDeadline) {
			return errUserSessionCacheObservationStale
		}
		if !completedAt.Before(sessionExpiresAt) {
			return ErrUserSessionInactive
		}
	}
	return nil
}

func confirmUserSessionActiveSnapshot(session *UserSession) error {
	if session == nil || session.SID == "" || session.UserID <= 0 || session.Version <= 0 || session.UserAuthVersion <= 0 {
		return ErrUserSessionInvalid
	}
	var count int64
	err := DB.Model(&UserSession{}).
		Where(
			"sid = ? AND user_id = ? AND status = ? AND revoked_at = ? AND expires_at > ? AND version = ? AND user_auth_version = ?",
			session.SID,
			session.UserID,
			UserSessionStatusActive,
			0,
			time.Now().Unix(),
			session.Version,
			session.UserAuthVersion,
		).
		Count(&count).Error
	if err != nil {
		return err
	}
	if count != 1 {
		return ErrUserSessionInactive
	}
	return nil
}

func writeUserSessionDenyFence(session *UserSession, status string, now int64, reason string) error {
	if !common.RedisEnabled {
		return nil
	}
	entry := session.cacheEntry()
	entry.Status = status
	entry.RevokedAt = now
	entry.RevokedReason = reason
	return writeUserSessionCache(entry, time.Time{})
}
