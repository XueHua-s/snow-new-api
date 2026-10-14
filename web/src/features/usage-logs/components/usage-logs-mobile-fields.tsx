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
import { flexRender, type Cell } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import {
  dotColorMap,
  textColorMap,
  type StatusVariant,
} from '@/components/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { LOG_TYPE_ENUM } from '../constants'
import type { UsageLog } from '../data/schema'
import { parseLogOther } from '../lib/format'
import {
  getLogTypeConfig,
  isDisplayableLogType,
  isTimingLogType,
} from '../lib/utils'
import { StreamTpsCell, TimingMetricsCell } from './timing-metrics-cell'
import { useUsageLogsContext } from './usage-logs-provider'

export function CompactCell<TData>({
  cell,
  fallback = '-',
  className,
  primaryOnly = false,
}: {
  cell?: Cell<TData, unknown>
  fallback?: string
  className?: string
  primaryOnly?: boolean
}) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden leading-tight [&_button]:max-w-full [&_span]:max-w-full',
        primaryOnly &&
          '[&_.flex-col]:min-w-0 [&_.flex-col>*:not(:first-child)]:hidden',
        className
      )}
    >
      {cell ? (
        flexRender(cell.column.columnDef.cell, cell.getContext())
      ) : (
        <span className='text-muted-foreground/50'>{fallback}</span>
      )}
    </div>
  )
}

export function SummaryField<TData>({
  label,
  cell,
  className,
  valueClassName,
  primaryOnly = false,
}: {
  label?: string
  cell?: Cell<TData, unknown>
  className?: string
  valueClassName?: string
  primaryOnly?: boolean
}) {
  if (!cell) return null

  return (
    <div
      className={cn('bg-muted/20 min-w-0 rounded-md px-2 py-1.5', className)}
    >
      {label != null && label !== '' && (
        <div className='text-muted-foreground mb-1 text-[11px] leading-none font-medium select-none'>
          {label}
        </div>
      )}
      <CompactCell
        cell={cell}
        primaryOnly={primaryOnly}
        className={valueClassName}
      />
    </div>
  )
}

export function MobileLogTimeStatus({
  createdAt,
  type,
}: {
  createdAt: unknown
  type: unknown
}) {
  const { t } = useTranslation()
  const timestamp = typeof createdAt === 'number' ? createdAt : undefined
  const logType = typeof type === 'number' ? type : undefined
  const config = getLogTypeConfig(logType ?? LOG_TYPE_ENUM.UNKNOWN)
  const variant = config.color as StatusVariant

  return (
    <div className='space-y-1'>
      <div className='font-mono text-xs leading-tight tabular-nums'>
        {formatTimestampToDate(timestamp)}
      </div>
      <div
        className={cn(
          'inline-flex items-center gap-1 text-xs leading-none font-medium',
          textColorMap[variant]
        )}
      >
        <span
          className={cn('size-1.5 shrink-0 rounded-full', dotColorMap[variant])}
          aria-hidden='true'
        />
        <span>{t(config.label)}</span>
      </div>
    </div>
  )
}

/** Mobile-only Tokens block: always show cache ↓/↑ when present (no label). */
export function MobileTokensField({ log }: { log: UsageLog }) {
  const { t } = useTranslation()

  if (!isDisplayableLogType(log.type)) return null

  const promptTokens = log.prompt_tokens || 0
  const completionTokens = log.completion_tokens || 0
  if (promptTokens === 0 && completionTokens === 0) {
    return (
      <div className='bg-muted/20 min-w-0 rounded-md px-2 py-1.5'>
        <span className='text-muted-foreground text-xs'>-</span>
      </div>
    )
  }

  const other = parseLogOther(log.other)
  const cacheReadTokens = other?.cache_tokens || 0
  const cacheWrite5m = other?.cache_creation_tokens_5m || 0
  const cacheWrite1h = other?.cache_creation_tokens_1h || 0
  const hasSplitCache = cacheWrite5m > 0 || cacheWrite1h > 0
  const cacheWriteTokens = hasSplitCache
    ? cacheWrite5m + cacheWrite1h
    : other?.cache_creation_tokens || 0
  const showCache = cacheReadTokens > 0 || cacheWriteTokens > 0

  return (
    <div className='bg-muted/20 min-w-0 rounded-md px-2 py-1.5'>
      <div className='flex flex-col gap-0.5'>
        <span className='font-mono text-xs font-medium tabular-nums'>
          {promptTokens.toLocaleString()} / {completionTokens.toLocaleString()}
        </span>
        {showCache ? (
          <div className='text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-none'>
            {cacheReadTokens > 0 && (
              <span>
                {t('Cache')}↓ {cacheReadTokens.toLocaleString()}
              </span>
            )}
            {cacheWriteTokens > 0 && (
              <span>↑ {cacheWriteTokens.toLocaleString()}</span>
            )}
          </div>
        ) : (
          <span className='text-muted-foreground/50 text-[11px] leading-none'>
            —
          </span>
        )}
      </div>
    </div>
  )
}

/** Mobile-only User block: own layout so avatar/name always line up on the same baseline. */
export function MobileUserField({ log }: { log: UsageLog }) {
  const { sensitiveVisible, setSelectedUserId, setUserInfoDialogOpen } =
    useUsageLogsContext()

  if (!log.username) return null

  return (
    <button
      type='button'
      className='bg-muted/20 flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left'
      onClick={(e) => {
        e.stopPropagation()
        setSelectedUserId(log.user_id)
        setUserInfoDialogOpen(true)
      }}
    >
      <Avatar className='ring-border/60 size-6 shrink-0 ring-1'>
        <AvatarFallback
          className={cn(
            'text-[11px] font-semibold',
            !sensitiveVisible && 'bg-muted text-muted-foreground'
          )}
          style={
            sensitiveVisible ? getUserAvatarStyle(log.username) : undefined
          }
        >
          {sensitiveVisible ? getUserAvatarFallback(log.username) : '•'}
        </AvatarFallback>
      </Avatar>
      <span className='text-foreground min-w-0 truncate text-sm'>
        {sensitiveVisible ? log.username : '••••'}
      </span>
    </button>
  )
}

/** Merge stream badge + TPS with first-token / duration on one row. */
export function MobileStreamTimingField({ log }: { log: UsageLog }) {
  if (!isTimingLogType(log.type)) return null

  const other = parseLogOther(log.other)
  const useTime = log.use_time || 0
  const tokensPerSecond =
    useTime > 0 && log.completion_tokens > 0
      ? log.completion_tokens / useTime
      : null

  return (
    <div className='bg-muted/20 flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5'>
      <TimingMetricsCell
        useTimeSec={useTime}
        completionTokens={log.completion_tokens}
        frtMs={other?.frt}
        isStream={log.is_stream}
        indicator='dot'
        className='min-w-0 flex-1'
      />
      <StreamTpsCell
        isStream={log.is_stream}
        tokensPerSecond={tokensPerSecond}
        streamStatus={other?.stream_status}
        className='shrink-0'
      />
    </div>
  )
}
