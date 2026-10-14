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
import { StatusBadge, type StatusBadgeProps } from '@/components/status-badge'
import dayjs from '@/lib/dayjs'
import { formatDateTimeStr, formatTimestampToDate } from '@/lib/format'

export type CodexRateLimitWindow = {
  used_percent?: number
  reset_at?: number
  reset_after_seconds?: number
  limit_window_seconds?: number
}

type CodexRateLimit = {
  plan_type?: string
  allowed?: boolean
  limit_reached?: boolean
  primary_window?: CodexRateLimitWindow
  secondary_window?: CodexRateLimitWindow
}

type CodexAdditionalRateLimit = {
  limit_name?: string
  metered_feature?: string
  rate_limit?: CodexRateLimit
  primary_window?: CodexRateLimitWindow
  secondary_window?: CodexRateLimitWindow
  plan_type?: string
}

export type CodexResetCredit = {
  id?: string
  reset_type?: string
  status?: string
  granted_at?: string | null
  expires_at?: string | null
  redeem_started_at?: string | null
  redeemed_at?: string | null
  profile_image_url?: string
  profile_user_id?: string
  title?: string
  description?: string
}

export type CodexResetCreditsPayload = {
  credits?: CodexResetCredit[]
  available_count?: number
  total_earned_count?: number
}

export type CodexUsagePayload = {
  plan_type?: string
  user_id?: string
  email?: string
  rate_limit?: CodexRateLimit
  additional_rate_limits?: CodexAdditionalRateLimit[]
  rate_limit_reset_credits?: {
    available_count?: number
  }
  credits?: {
    overage_limit_reached?: boolean
  }
  spend_control?: {
    reached?: boolean
  }
}

export type CodexUsageDialogData = {
  success: boolean
  message?: string
  upstream_status?: number
  data?: Record<string, unknown>
}

function clampPercent(value: unknown): number {
  const v = Number(value)
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0
}

export function formatUnixSeconds(unixSeconds: unknown): string {
  const v = Number(unixSeconds)
  return Number.isFinite(v) && v > 0 ? formatTimestampToDate(v) : '-'
}

export function formatIsoTimestamp(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return '-'
  }
  const d = dayjs(value)
  if (!d.isValid()) {
    return value
  }
  return formatDateTimeStr(d.toDate())
}

export function formatDurationSeconds(
  seconds: unknown,
  t: (key: string) => string
): string {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0) {
    return '-'
  }

  const total = Math.floor(s)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  if (hours > 0) {
    return `${hours}${t('h')} ${minutes}${t('m')}`
  }
  if (minutes > 0) {
    return `${minutes}${t('m')} ${secs}${t('s')}`
  }
  return `${secs}${t('s')}`
}

export function formatTimeLeftUntil(
  value: unknown,
  t: (key: string) => string
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return '-'
  }
  const expiresAt = dayjs(value)
  if (!expiresAt.isValid()) {
    return '-'
  }

  const secondsLeft = expiresAt.diff(dayjs(), 'second')
  if (secondsLeft <= 0) {
    return t('Expired')
  }

  const days = Math.floor(secondsLeft / (24 * 60 * 60))
  const remainingSeconds = secondsLeft % (24 * 60 * 60)
  if (days > 0) {
    const hours = Math.floor(remainingSeconds / 3600)
    return `${days} ${t('days')} ${hours}${t('h')}`
  }

  return formatDurationSeconds(secondsLeft, t)
}

function normalizePlanType(value: unknown): string {
  if (value == null) {
    return ''
  }
  return String(value).trim().toLowerCase()
}

function parseTimeValue(value: unknown): number {
  if (typeof value !== 'string' || value.trim() === '') {
    return Number.POSITIVE_INFINITY
  }
  const d = dayjs(value)
  return d.isValid() ? d.valueOf() : Number.POSITIVE_INFINITY
}

export function normalizeResetCreditStatus(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export function sortResetCredits(
  credits: CodexResetCredit[]
): CodexResetCredit[] {
  return [...credits].sort((a, b) => {
    const aAvailable = normalizeResetCreditStatus(a.status) === 'available'
    const bAvailable = normalizeResetCreditStatus(b.status) === 'available'
    if (aAvailable !== bAvailable) {
      return aAvailable ? -1 : 1
    }

    const expiresDiff =
      parseTimeValue(a.expires_at) - parseTimeValue(b.expires_at)
    if (expiresDiff !== 0) {
      return expiresDiff
    }

    const grantedDiff =
      parseTimeValue(a.granted_at) - parseTimeValue(b.granted_at)
    if (grantedDiff !== 0) {
      return grantedDiff
    }

    return String(a.id || '').localeCompare(String(b.id || ''))
  })
}

function classifyWindowByDuration(
  windowData?: CodexRateLimitWindow | null
): 'weekly' | 'fiveHour' | null {
  const seconds = Number(windowData?.limit_window_seconds)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null
  }
  return seconds >= 24 * 60 * 60 ? 'weekly' : 'fiveHour'
}

export type RateLimitSource = {
  plan_type?: string
  rate_limit?: CodexRateLimit
}

export function resolveRateLimitWindows(data: RateLimitSource | null): {
  fiveHourWindow: CodexRateLimitWindow | null
  weeklyWindow: CodexRateLimitWindow | null
} {
  const rateLimit = data?.rate_limit ?? {}
  const primary = rateLimit?.primary_window ?? null
  const secondary = rateLimit?.secondary_window ?? null
  const windows = [primary, secondary].filter(Boolean) as CodexRateLimitWindow[]
  const planType = normalizePlanType(data?.plan_type ?? rateLimit?.plan_type)

  let fiveHourWindow: CodexRateLimitWindow | null = null
  let weeklyWindow: CodexRateLimitWindow | null = null

  for (const w of windows) {
    const bucket = classifyWindowByDuration(w)
    if (bucket === 'fiveHour' && !fiveHourWindow) {
      fiveHourWindow = w
      continue
    }
    if (bucket === 'weekly' && !weeklyWindow) {
      weeklyWindow = w
    }
  }

  if (planType === 'free') {
    if (!weeklyWindow) {
      weeklyWindow = primary ?? secondary ?? null
    }
    return { fiveHourWindow: null, weeklyWindow }
  }

  if (!fiveHourWindow && !weeklyWindow) {
    return { fiveHourWindow: primary, weeklyWindow: secondary }
  }

  if (!fiveHourWindow) {
    fiveHourWindow = windows.find((w) => w !== weeklyWindow) ?? null
  }
  if (!weeklyWindow) {
    weeklyWindow = windows.find((w) => w !== fiveHourWindow) ?? null
  }

  return { fiveHourWindow, weeklyWindow }
}

const PLAN_TYPE_BADGE: Record<
  string,
  { label: string; variant: StatusBadgeProps['variant'] }
> = {
  enterprise: { label: 'Enterprise', variant: 'success' },
  team: { label: 'Team', variant: 'info' },
  pro: { label: 'Pro', variant: 'blue' },
  plus: { label: 'Plus', variant: 'purple' },
  free: { label: 'Free', variant: 'warning' },
}

const RESET_CREDIT_STATUS_BADGE: Record<
  string,
  { label: string; variant: StatusBadgeProps['variant'] }
> = {
  available: { label: 'Available', variant: 'success' },
  redeemed: { label: 'Redeemed', variant: 'neutral' },
  expired: { label: 'Expired', variant: 'warning' },
}

export function getAccountTypeBadge(
  value: unknown,
  t: (key: string) => string
): { label: string; variant: StatusBadgeProps['variant'] } {
  const normalized = normalizePlanType(value)
  return (
    PLAN_TYPE_BADGE[normalized] ?? {
      label: String(value || '') || t('Unknown'),
      variant: 'neutral' as const,
    }
  )
}

export function getResetCreditStatusBadge(
  value: unknown,
  t: (key: string) => string
): { label: string; variant: StatusBadgeProps['variant'] } {
  const normalized = normalizeResetCreditStatus(value)
  return (
    RESET_CREDIT_STATUS_BADGE[normalized] ?? {
      label: String(value || '') || t('Unknown'),
      variant: 'neutral' as const,
    }
  )
}

export function windowLabel(windowData?: CodexRateLimitWindow | null) {
  const percent = clampPercent(windowData?.used_percent)
  let variant: StatusBadgeProps['variant'] = 'info'
  if (percent >= 95) {
    variant = 'danger'
  } else if (percent >= 80) {
    variant = 'warning'
  }
  return { percent, variant }
}

export function getUsageStatusBadge(
  rateLimit: CodexRateLimit | undefined,
  t: (key: string) => string
) {
  if (!rateLimit || Object.keys(rateLimit).length === 0) {
    return (
      <StatusBadge label={t('Pending')} variant='neutral' copyable={false} />
    )
  }
  if (rateLimit.allowed && !rateLimit.limit_reached) {
    return (
      <StatusBadge label={t('Available')} variant='success' copyable={false} />
    )
  }
  return <StatusBadge label={t('Limited')} variant='danger' copyable={false} />
}

export function formatLabelValue(label: string, value: string) {
  return label.endsWith('：') ? `${label}${value}` : `${label} ${value}`
}

export const percentTextClassName: Record<
  NonNullable<StatusBadgeProps['variant']>,
  string
> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  info: 'text-info',
  neutral: 'text-muted-foreground',
  purple: 'text-chart-4',
  amber: 'text-warning',
  blue: 'text-chart-1',
  cyan: 'text-chart-2',
  green: 'text-success',
  grey: 'text-muted-foreground',
  indigo: 'text-chart-1',
  'light-blue': 'text-info',
  'light-green': 'text-emerald-500 dark:text-emerald-300',
  lime: 'text-chart-3',
  orange: 'text-warning',
  pink: 'text-chart-5',
  red: 'text-destructive',
  teal: 'text-chart-2',
  violet: 'text-chart-4',
  yellow: 'text-warning',
}
