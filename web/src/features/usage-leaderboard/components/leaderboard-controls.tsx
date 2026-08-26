import { Flame, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  USAGE_LEADERBOARD_METRICS,
  USAGE_LEADERBOARD_PERIODS,
} from '../constants'
import type { UsageLeaderboardMetric, UsageLeaderboardPeriod } from '../types'

type LeaderboardControlsProps = {
  period: UsageLeaderboardPeriod
  metric: UsageLeaderboardMetric
  onPeriodChange: (period: UsageLeaderboardPeriod) => void
  onMetricChange: (metric: UsageLeaderboardMetric) => void
}

export function LeaderboardControls(props: LeaderboardControlsProps) {
  const { t } = useTranslation()

  return (
    <div className='lb-default-control flex flex-col gap-3 rounded-2xl p-2.5 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between'>
      <div
        className='lb-default-segmented flex gap-1 overflow-x-auto rounded-xl p-1'
        aria-label={t('Ranking period')}
        role='tablist'
      >
        {USAGE_LEADERBOARD_PERIODS.map((item) => (
          <button
            key={item.value}
            type='button'
            role='tab'
            aria-selected={props.period === item.value}
            onClick={() => props.onPeriodChange(item.value)}
            className={cn(
              'lb-default-tab h-9 shrink-0 rounded-lg px-3.5 text-xs font-semibold',
              props.period === item.value
                ? 'lb-default-tab-active text-white'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>
      <div
        className='lb-default-segmented grid grid-cols-2 rounded-xl p-1'
        role='tablist'
        aria-label={t('Ranking metric')}
      >
        {USAGE_LEADERBOARD_METRICS.map((item) => (
          <button
            key={item.value}
            type='button'
            role='tab'
            aria-selected={props.metric === item.value}
            onClick={() => props.onMetricChange(item.value)}
            className={cn(
              'lb-default-tab inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold',
              props.metric === item.value
                ? 'lb-default-tab-active text-white'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {item.value === 'tokens' ? (
              <Zap className='size-3.5' />
            ) : (
              <Flame className='size-3.5' />
            )}
            {t(item.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
