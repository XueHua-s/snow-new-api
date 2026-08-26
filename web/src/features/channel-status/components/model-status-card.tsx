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
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatTTFT, getVisibleErrors } from '../lib'
import type { ChannelStatusModel } from '../types'

type ModelStatusCardProps = {
  model: ChannelStatusModel
  sevenDay: boolean
}

const HEALTH_STYLES: Record<ChannelStatusModel['health'], string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-destructive',
  idle: 'bg-muted-foreground/40',
}

function getBadgeStyles(model: ChannelStatusModel): string {
  if (model.request_state === 'no_requests')
    return 'bg-muted text-muted-foreground'
  if (model.request_state === 'all_failed' || model.success_rate < 50) {
    return 'bg-destructive/10 text-destructive'
  }
  if (model.success_rate < 80) {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }
  return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
}

function getProgressStyles(model: ChannelStatusModel): string {
  if (model.request_state === 'no_requests') {
    return '[&_[data-slot=progress-indicator]]:bg-muted-foreground/40'
  }
  if (model.request_state === 'all_failed' || model.success_rate < 50) {
    return '[&_[data-slot=progress-indicator]]:bg-destructive'
  }
  if (model.success_rate < 80) {
    return '[&_[data-slot=progress-indicator]]:bg-amber-500'
  }
  return '[&_[data-slot=progress-indicator]]:bg-emerald-500'
}

export const ModelStatusCard = memo(function ModelStatusCard(
  props: ModelStatusCardProps
) {
  const { t } = useTranslation()
  const noRequests = props.model.request_state === 'no_requests'
  const allFailed = props.model.request_state === 'all_failed'
  const successRate = Number(props.model.success_rate || 0)
  const errors = getVisibleErrors(props.model.last_errors)
  const averageTTFT = formatTTFT(props.model.avg_ttft_ms)
  const responseTime =
    props.model.avg_resp_sec > 0
      ? `${props.model.avg_resp_sec.toFixed(1)}s`
      : '—'

  let successLabel = `${t(props.sevenDay ? '7-day availability' : 'Success rate')} ${successRate.toFixed(1)}%`
  if (noRequests) successLabel = t('No recent requests')
  else if (allFailed) successLabel = t('All requests failed')

  let primaryLabel = t(props.sevenDay ? '7-day availability' : 'Average TTFT')
  let primaryValue = props.sevenDay
    ? `${successRate.toFixed(1)}%`
    : averageTTFT.text
  if (noRequests) {
    primaryLabel = t('Status')
    primaryValue = t('No recent requests')
  }

  return (
    <article
      className='border-border bg-card flex min-h-44 flex-col rounded-xl border p-3 transition-[border-color,box-shadow] [contain-intrinsic-size:180px] [content-visibility:auto] hover:shadow-sm'
      aria-label={props.model.model}
    >
      <div className='flex min-w-0 items-start justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              HEALTH_STYLES[props.model.health]
            )}
          />
          <span
            className='truncate text-sm font-semibold'
            title={props.model.model}
          >
            {props.model.model}
          </span>
        </div>
        <Badge variant='ghost' className={getBadgeStyles(props.model)}>
          {successLabel}
        </Badge>
      </div>

      <Progress
        value={noRequests ? 0 : successRate}
        className={cn('mt-3', getProgressStyles(props.model))}
        aria-label={`${props.model.model} ${successLabel}`}
      />

      <div className='mt-3 grid grid-cols-2 gap-2'>
        <div className='bg-muted/60 rounded-lg px-3 py-2'>
          <div className='text-muted-foreground text-[11px]'>
            {primaryLabel}
          </div>
          <div className='mt-1 text-sm font-semibold'>{primaryValue}</div>
        </div>
        <div className='bg-muted/60 rounded-lg px-3 py-2'>
          <div className='text-muted-foreground text-[11px]'>
            {t(allFailed ? 'Request status' : 'Average duration')}
          </div>
          <div className='mt-1 text-sm font-semibold'>
            {allFailed ? t('All requests failed') : responseTime}
          </div>
        </div>
      </div>

      <div className='text-muted-foreground mt-2 min-h-8 space-y-1 text-[11px] leading-4'>
        {!props.sevenDay && !noRequests && (
          <div>
            {t('Error rate {{error}} · Empty rate {{empty}}', {
              error: `${Number(props.model.error_rate || 0).toFixed(1)}%`,
              empty: `${Number(props.model.empty_rate || 0).toFixed(1)}%`,
            })}
          </div>
        )}
        {errors.length > 0 && (
          <div className='line-clamp-2' title={errors.join(' / ')}>
            {t('Common errors: {{errors}}', { errors: errors.join(' / ') })}
          </div>
        )}
      </div>
    </article>
  )
})
