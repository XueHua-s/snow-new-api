export type UsageLeaderboardPeriod = 'day' | 'week' | 'month' | 'year' | 'all'

export type UsageLeaderboardMetric = 'tokens' | 'quota'

export type UsageLeaderboardEntry = {
  rank: number
  username: string
  is_current: boolean
  value: number
  share: number
  previous_rank?: number
  rank_delta: number
}

export type UsageLeaderboardSelf = UsageLeaderboardEntry & {
  ranked: boolean
  gap_to_previous: number
  gap_to_leader: number
  gap_to_top_ten: number
  surpassed_percent: number
}

export type UsageLeaderboardTrendPoint = {
  bucket: number
  username: string
  is_current: boolean
  value: number
}

export type UsageLeaderboardBoard = {
  total: number
  active_users: number
  champion: UsageLeaderboardEntry | null
  top: UsageLeaderboardEntry[]
  self: UsageLeaderboardSelf
  trend: UsageLeaderboardTrendPoint[]
}

export type UsageLeaderboardSnapshot = {
  period: UsageLeaderboardPeriod
  starts_at: number
  ends_at: number
  updated_at: number
  token_board: UsageLeaderboardBoard
  quota_board: UsageLeaderboardBoard
}

export type UsageLeaderboardResponse = {
  success: boolean
  message?: string
  data: UsageLeaderboardSnapshot
}
