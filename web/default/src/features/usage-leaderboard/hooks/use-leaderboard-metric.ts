import { useCallback, useState } from 'react'
import type { UsageLeaderboardMetric } from '../types'

const STORAGE_KEY = 'usage-leaderboard:metric:v1'

function readStoredMetric(): UsageLeaderboardMetric {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'quota' ? 'quota' : 'tokens'
  } catch {
    return 'tokens'
  }
}

export function useLeaderboardMetric(): readonly [
  UsageLeaderboardMetric,
  (metric: UsageLeaderboardMetric) => void,
] {
  const [metric, setMetric] = useState<UsageLeaderboardMetric>(readStoredMetric)

  const updateMetric = useCallback((next: UsageLeaderboardMetric) => {
    setMetric(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The preference is optional; private browsing can disable storage.
    }
  }, [])

  return [metric, updateMetric] as const
}
