/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
export type ChannelStatusModel = {
  model: string
  section: string
  family: string
  avg_ttft_ms: number
  min_ttft_ms: number
  max_ttft_ms: number
  avg_resp_sec: number
  success_rate: number
  error_rate: number
  empty_rate: number
  health: 'good' | 'warn' | 'bad' | 'idle'
  request_state: 'active' | 'no_requests' | 'all_failed'
  last_errors?: string[]
  stream_rate?: number
  groups?: string[]
}

export type ChannelStatusPulse = {
  server_time_ms: number
  generated_ms: number
  window_seconds: number
  window_end_ms: number
  overall_ttft_ms: number
  min_ttft_ms: number
  max_ttft_ms: number
  models: ChannelStatusModel[]
  demo: boolean
  error?: string
}

export type ChannelStatusSocketMessage = {
  type: 'snapshot' | 'heartbeat'
  timestamp_ms: number
  window_seconds: number
  data?: ChannelStatusPulse
  error?: string
}

export type ChannelStatusConnection =
  | 'connected'
  | 'connecting'
  | 'reconnecting'

export type CodexUsageWindow = {
  used_percent: number
  reset_at: number
  reset_after_seconds: number
  limit_window_seconds: number
}

export type CodexUsageGroup = {
  name?: string
  metered_feature?: string
  five_hour_window?: CodexUsageWindow
  weekly_window?: CodexUsageWindow
}

export type CodexChannelUsage = {
  name: string
  plan_type?: string
  available?: boolean
  upstream_status?: number
  base_limit: CodexUsageGroup
  additional_limits: CodexUsageGroup[]
  error?: string
}

export type CodexChannelUsagePayload = {
  channels: CodexChannelUsage[]
  updated_at: number
}

export type ChannelStatusFamily = {
  family: string
  models: ChannelStatusModel[]
}

export type ChannelStatusSection = {
  section: string
  description: string
  modelCount: number
  families: ChannelStatusFamily[]
}
