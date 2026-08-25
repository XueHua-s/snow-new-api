import type { UsageLeaderboardMetric, UsageLeaderboardPeriod } from './types'

export const USAGE_LEADERBOARD_PERIOD_VALUES = [
  'day',
  'week',
  'month',
  'year',
  'all',
] as const satisfies readonly UsageLeaderboardPeriod[]

export const USAGE_LEADERBOARD_PERIOD_SET = new Set<UsageLeaderboardPeriod>(
  USAGE_LEADERBOARD_PERIOD_VALUES
)

export const USAGE_LEADERBOARD_PERIOD_COPY: Record<
  UsageLeaderboardPeriod,
  string
> = {
  day: "Today's",
  week: "This week's",
  month: "This month's",
  year: "This year's",
  all: 'All-time leaderboard',
}

export const USAGE_LEADERBOARD_PERIODS: Array<{
  value: UsageLeaderboardPeriod
  labelKey: string
}> = [
  { value: 'day', labelKey: 'Today leaderboard' },
  { value: 'week', labelKey: 'This week leaderboard' },
  { value: 'month', labelKey: 'This month leaderboard' },
  { value: 'year', labelKey: 'This year leaderboard' },
  { value: 'all', labelKey: 'All-time leaderboard' },
]

export const USAGE_LEADERBOARD_METRICS: Array<{
  value: UsageLeaderboardMetric
  labelKey: string
}> = [
  { value: 'tokens', labelKey: 'Token volume' },
  { value: 'quota', labelKey: 'Spending quota' },
]

export const USAGE_LEADERBOARD_RANK_COLORS: Record<number, string> = {
  1: '#f59e0b',
  2: '#94a3b8',
  3: '#c26a35',
}

export const USAGE_LEADERBOARD_TREND_PALETTE = [
  '#f59e0b',
  '#94a3b8',
  '#c26a35',
  '#3b82f6',
  '#8b5cf6',
  '#f97316',
] as const

export const USAGE_LEADERBOARD_PARTICLES = [
  { x: '8%', y: '22%', size: 3, delay: '-0.4s' },
  { x: '18%', y: '76%', size: 2, delay: '-1.8s' },
  { x: '32%', y: '18%', size: 2, delay: '-2.7s' },
  { x: '47%', y: '82%', size: 3, delay: '-1.1s' },
  { x: '59%', y: '28%', size: 2, delay: '-3.2s' },
  { x: '72%', y: '72%', size: 2, delay: '-0.9s' },
  { x: '84%', y: '18%', size: 3, delay: '-2.1s' },
  { x: '92%', y: '58%', size: 2, delay: '-1.4s' },
] as const
