import { useQuery } from '@tanstack/react-query'
import { getUsageLeaderboard } from '../api'
import type { UsageLeaderboardPeriod } from '../types'

export function useUsageLeaderboard(period: UsageLeaderboardPeriod) {
  return useQuery({
    queryKey: ['usage-leaderboard', period],
    queryFn: () => getUsageLeaderboard(period),
    select: (response) => response.data,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
