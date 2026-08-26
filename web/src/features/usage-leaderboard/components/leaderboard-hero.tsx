import type { CSSProperties } from 'react'
import { Crown, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import {
  USAGE_LEADERBOARD_PARTICLES,
  USAGE_LEADERBOARD_PERIOD_COPY,
} from '../constants'
import { formatLeaderboardValue } from '../lib/format'
import type {
  UsageLeaderboardBoard,
  UsageLeaderboardMetric,
  UsageLeaderboardPeriod,
} from '../types'

type LeaderboardHeroProps = {
  period: UsageLeaderboardPeriod
  metric: UsageLeaderboardMetric
  board: UsageLeaderboardBoard | null
  loading: boolean
}

export function LeaderboardHero(props: LeaderboardHeroProps) {
  const { t } = useTranslation()
  const champion = props.board?.champion
  const periodLabel = t(USAGE_LEADERBOARD_PERIOD_COPY[props.period])
  const selfIsChampion = champion?.is_current === true
  let title: string
  if (selfIsChampion) {
    title = t('You are crowned {{period}} Grind King', {
      period: periodLabel,
    })
  } else if (champion) {
    title = t('{{username}} holds the {{period}} throne', {
      username: champion.username,
      period: periodLabel,
    })
  } else {
    title = t('The throne is waiting for its first challenger')
  }

  return (
    <section
      className={cn(
        'lb-default-hero relative isolate overflow-hidden rounded-2xl p-5 sm:p-7',
        selfIsChampion && 'lb-default-hero-champion'
      )}
    >
      <div className='lb-default-hero-orbit' aria-hidden />
      <div className='lb-default-hero-streak' aria-hidden />
      <div aria-hidden>
        {USAGE_LEADERBOARD_PARTICLES.slice(0, 6).map((particle) => (
          <span
            key={`${particle.x}-${particle.y}`}
            className='lb-default-hero-spark'
            style={
              {
                '--lb-x': particle.x,
                '--lb-y': particle.y,
                '--lb-delay': particle.delay,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className='lb-default-hero-content relative flex flex-col gap-5'>
        <div className='max-w-2xl'>
          <div className='lb-default-hero-badge mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold tracking-wide text-blue-700 dark:text-blue-300'>
            <Sparkles className='size-3.5' aria-hidden />
            {t('Every call counts. Every Token leaves a mark.')}
          </div>
          <h1 className='text-2xl font-black tracking-tight sm:text-3xl'>
            {title}
          </h1>
          <p className='text-muted-foreground mt-2 max-w-xl text-sm leading-6 sm:text-base'>
            {selfIsChampion
              ? t(
                  'The crown is yours—but the pack is chasing. Keep the lead and make the record harder to reach.'
                )
              : t(
                  'The gap is not a wall; it is your next visible milestone. Push one more effective call and move the bar.'
                )}
          </p>
        </div>
        <div className='lb-default-champion-card bg-background/75 relative flex min-w-[240px] items-center gap-4 rounded-xl p-4 backdrop-blur'>
          <div className='lb-default-crown-orb relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-white'>
            <span className='lb-default-crown-ring' aria-hidden />
            <Crown
              className='lb-default-crown-icon relative z-10 size-7'
              aria-hidden
            />
          </div>
          <div className='min-w-0'>
            <div className='text-muted-foreground text-[11px] font-bold tracking-widest uppercase'>
              {t('{{period}} champion', { period: periodLabel })}
            </div>
            {props.loading ? (
              <Skeleton className='mt-2 h-7 w-32' />
            ) : champion ? (
              <>
                <div className='truncate text-lg font-black'>
                  {champion.username}
                </div>
                <div className='font-mono text-sm font-bold text-amber-600 dark:text-amber-400'>
                  {formatLeaderboardValue(props.metric, champion.value)}
                </div>
              </>
            ) : (
              <div className='text-sm font-semibold'>{t('Vacant throne')}</div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
