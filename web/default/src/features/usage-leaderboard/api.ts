import { api } from '@/lib/api'
import type { UsageLeaderboardPeriod, UsageLeaderboardResponse } from './types'

export async function getUsageLeaderboard(
  period: UsageLeaderboardPeriod
): Promise<UsageLeaderboardResponse> {
  const res = await api.get<UsageLeaderboardResponse>(
    '/api/usage-leaderboard',
    { params: { period } }
  )
  return res.data
}
