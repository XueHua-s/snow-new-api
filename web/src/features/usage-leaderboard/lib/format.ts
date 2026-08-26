import { formatCompactNumber, formatQuota } from '@/lib/format'
import type { UsageLeaderboardMetric, UsageLeaderboardPeriod } from '../types'

export function formatLeaderboardValue(
  metric: UsageLeaderboardMetric,
  value: number
): string {
  if (metric === 'quota') return formatQuota(value)
  return `${formatCompactNumber(value)} Tokens`
}

export function formatLeaderboardAxisValue(
  metric: UsageLeaderboardMetric,
  value: number
): string {
  if (metric === 'quota') return formatQuota(value)
  return formatCompactNumber(value)
}

export function formatLeaderboardBucket(
  period: UsageLeaderboardPeriod,
  bucket: number
): string {
  const date = new Date(bucket * 1000)
  if (period === 'day') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (period === 'year' || period === 'all') {
    return date.toLocaleDateString([], { year: 'numeric', month: 'short' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
