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
import { formatCurrencyFromUSD, formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestampToDate } from '@/lib/format'

import { RESPONSE_TIME_CONFIG, RESPONSE_TIME_THRESHOLDS } from '../constants'

// ============================================================================
// Balance Formatting
// ============================================================================

/**
 * Format balance with currency symbol
 */
export function formatBalance(balance: number | null | undefined): string {
  if (balance == null || Number.isNaN(balance)) {
    return '-'
  }
  return formatCurrencyFromUSD(balance, {
    digitsLarge: 2,
    digitsSmall: 4,
    abbreviate: false,
  })
}

/**
 * Get balance status color
 */
export function getBalanceVariant(
  balance: number
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (balance === 0) {
    return 'neutral'
  }
  if (balance < 1) {
    return 'danger'
  }
  if (balance < 10) {
    return 'warning'
  }
  return 'success'
}

// ============================================================================
// Response Time Utilities
// ============================================================================

/** Optional i18n: (key, options) => string, e.g. useTranslation().t */
type TFunction = (key: string, options?: { value?: number | string }) => string

/**
 * Format response time in milliseconds to human-readable.
 * Pass `t` from useTranslation() for i18n (e.g. "Not tested", "{{value}}ms", "{{value}}s").
 */
export function formatResponseTime(timeMs: number, t?: TFunction): string {
  if (timeMs === 0) {
    return t ? t('Not tested') : 'Not tested'
  }
  if (timeMs < 1000) {
    return t ? t('{{value}}ms', { value: timeMs }) : `${timeMs}ms`
  }
  return t
    ? t('{{value}}s', { value: (timeMs / 1000).toFixed(2) })
    : `${(timeMs / 1000).toFixed(2)}s`
}

/**
 * Get response time performance rating
 */
export function getResponseTimeConfig(timeMs: number) {
  if (timeMs === 0) {
    return RESPONSE_TIME_CONFIG.UNKNOWN
  }
  if (timeMs <= RESPONSE_TIME_THRESHOLDS.EXCELLENT) {
    return RESPONSE_TIME_CONFIG.EXCELLENT
  }
  if (timeMs <= RESPONSE_TIME_THRESHOLDS.GOOD) {
    return RESPONSE_TIME_CONFIG.GOOD
  }
  if (timeMs <= RESPONSE_TIME_THRESHOLDS.FAIR) {
    return RESPONSE_TIME_CONFIG.FAIR
  }
  if (timeMs <= RESPONSE_TIME_THRESHOLDS.POOR) {
    return RESPONSE_TIME_CONFIG.POOR
  }
  return RESPONSE_TIME_CONFIG.POOR
}

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * Format a Unix timestamp (seconds) as a compact, locale-aware relative time.
 * Uses `Intl.RelativeTimeFormat` with the `narrow` style so the label stays
 * short inside table cells, e.g. "4h ago" / "42m ago" (en) or "4 小时前" (zh),
 * instead of the verbose "4 hours ago".
 */
export function formatRelativeTime(
  timestamp: number,
  locale?: Intl.LocalesArgument
): string {
  if (!timestamp || timestamp === 0) {
    return 'Never'
  }

  try {
    const diffSec = timestamp - Date.now() / 1000
    const absSec = Math.abs(diffSec)
    const rtf = new Intl.RelativeTimeFormat(locale, {
      numeric: 'always',
      style: 'narrow',
    })

    const MINUTE = 60
    const HOUR = 60 * MINUTE
    const DAY = 24 * HOUR
    const MONTH = 30 * DAY
    const YEAR = 365 * DAY

    let value: number
    let unit: Intl.RelativeTimeFormatUnit
    if (absSec < MINUTE) {
      value = Math.round(diffSec)
      unit = 'second'
    } else if (absSec < HOUR) {
      value = Math.round(diffSec / MINUTE)
      unit = 'minute'
    } else if (absSec < DAY) {
      value = Math.round(diffSec / HOUR)
      unit = 'hour'
    } else if (absSec < MONTH) {
      value = Math.round(diffSec / DAY)
      unit = 'day'
    } else if (absSec < YEAR) {
      value = Math.round(diffSec / MONTH)
      unit = 'month'
    } else {
      value = Math.round(diffSec / YEAR)
      unit = 'year'
    }

    const formatted = rtf.format(value, unit)
    const primaryLocale = Array.isArray(locale) ? locale[0] : locale
    const language = primaryLocale?.toString()
    if (language?.startsWith('zh')) {
      return formatted.replaceAll(/(\d)([\u4e00-\u9fff])/g, '$1 $2')
    }
    return formatted
  } catch {
    return 'Unknown'
  }
}

/**
 * Format Unix timestamp to date string
 */
export function formatTimestamp(timestamp: number): string {
  if (!timestamp || timestamp === 0) {
    return 'N/A'
  }

  try {
    return formatTimestampToDate(timestamp)
  } catch {
    return 'Invalid date'
  }
}

// ============================================================================
// Quota Formatting
// ============================================================================

/** Format quota units using the global currency display configuration. */
export function formatQuota(quota: number): string {
  return formatQuotaWithCurrency(quota, {
    digitsLarge: 2,
    digitsSmall: 4,
    abbreviate: true,
  })
}

// ============================================================================
// Priority & Weight Utilities
// ============================================================================

/**
 * Get priority display value
 */
export function getPriorityDisplay(
  priority: number | null | undefined
): string {
  if (priority === null || priority === undefined) {
    return '0'
  }
  return String(priority)
}

/**
 * Get weight display value
 */
export function getWeightDisplay(weight: number | null | undefined): string {
  if (weight === null || weight === undefined) {
    return '0'
  }
  return String(weight)
}
