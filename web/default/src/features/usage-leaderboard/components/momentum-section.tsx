import type { CSSProperties, ReactNode } from 'react'
import { Flame, Sparkles, Target, Trophy, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
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

type PersonalMomentumProps = {
  board: UsageLeaderboardBoard
  metric: UsageLeaderboardMetric
  period: UsageLeaderboardPeriod
}

export function PersonalMomentum(props: PersonalMomentumProps) {
  const { t } = useTranslation()
  const self = props.board.self
  let callout: string

  if (self.rank === 1) {
    callout = t(
      'You set the pace. Defend the crown and turn your lead into a moat.'
    )
  } else if (!self.ranked || self.rank > 10) {
    callout = t('Advance {{gap}} more to break into the Top 10.', {
      gap: formatLeaderboardValue(props.metric, self.gap_to_top_ten),
    })
  } else {
    callout = t(
      'Only {{gap}} separates you from the next rank. The next position is within reach.',
      {
        gap: formatLeaderboardValue(props.metric, self.gap_to_previous),
      }
    )
  }

  const breakthroughGap =
    self.rank > 10 || !self.ranked ? self.gap_to_top_ten : self.gap_to_previous

  return (
    <section className='lb-default-momentum-grid grid min-w-0 gap-4'>
      <MomentumCard
        icon={<Trophy className='size-4' aria-hidden />}
        label={t('My current rank')}
        value={self.ranked ? `#${self.rank}` : t('Not ranked')}
        note={
          self.rank === 1 ? t('Crowned now') : t('Your position on the board')
        }
        accent={self.rank === 1 ? 'gold' : 'blue'}
        energy={self.rank === 1 ? 'champion' : 'chase'}
      />
      <MomentumCard
        icon={<Zap className='size-4' aria-hidden />}
        label={t('My grind value')}
        value={formatLeaderboardValue(props.metric, self.value)}
        note={t('{{percent}}% of active users surpassed', {
          percent: self.surpassed_percent.toFixed(0),
        })}
        energy='data'
      />
      <MomentumCard
        icon={<Target className='size-4' aria-hidden />}
        label={t('Next breakthrough')}
        value={
          self.rank === 1
            ? t('Defend #1')
            : formatLeaderboardValue(props.metric, breakthroughGap)
        }
        note={t('One clear target, no vague effort')}
        energy='target'
      />
      <DeclarationCard callout={callout} period={props.period} />
    </section>
  )
}

function DeclarationCard(props: {
  callout: string
  period: UsageLeaderboardPeriod
}) {
  const { t } = useTranslation()

  return (
    <div className='lb-default-declaration relative isolate min-h-[126px] overflow-hidden rounded-2xl p-4'>
      <div className='lb-default-aurora' aria-hidden />
      <div className='lb-default-grid' aria-hidden />
      <div className='lb-default-sweep' aria-hidden />
      <Flame
        className='lb-default-flame absolute -right-2 -bottom-4 size-[92px]'
        aria-hidden
      />
      <div aria-hidden>
        {USAGE_LEADERBOARD_PARTICLES.map((particle) => (
          <span
            key={`${particle.x}-${particle.y}`}
            className='lb-default-particle'
            style={
              {
                '--lb-x': particle.x,
                '--lb-y': particle.y,
                '--lb-size': `${particle.size}px`,
                '--lb-delay': particle.delay,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className='relative z-10'>
        <div className='flex items-center gap-2 text-xs font-black tracking-wide text-blue-700 dark:text-blue-300'>
          <span className='lb-default-live-dot' aria-hidden />
          {t('{{period}} battle cry', {
            period: t(USAGE_LEADERBOARD_PERIOD_COPY[props.period]),
          })}
        </div>
        <p className='mt-2 text-sm leading-5 font-black'>{props.callout}</p>
        <div className='mt-3 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.16em] text-violet-600/80 dark:text-violet-300/80'>
          <Sparkles className='size-3' aria-hidden />
          {t(
            'The throne never waits. Momentum belongs to those who keep moving.'
          )}
        </div>
      </div>
    </div>
  )
}

type MomentumCardProps = {
  icon: ReactNode
  label: string
  value: string
  note: string
  accent?: 'gold' | 'blue'
  energy: 'champion' | 'chase' | 'data' | 'target'
}

function MomentumCard(props: MomentumCardProps) {
  return (
    <div
      className={cn(
        'lb-default-card bg-card relative overflow-hidden rounded-2xl p-4',
        `lb-default-stat-${props.energy}`
      )}
    >
      <span className='lb-default-stat-glint' aria-hidden />
      <div
        className={cn(
          'text-muted-foreground relative z-10 flex items-center gap-2 text-xs font-semibold',
          props.accent === 'gold' && 'text-amber-600 dark:text-amber-400',
          props.accent === 'blue' && 'text-blue-600 dark:text-blue-400'
        )}
      >
        {props.icon}
        {props.label}
      </div>
      <div className='relative z-10 mt-2 truncate font-mono text-xl font-black tabular-nums'>
        {props.value}
      </div>
      <div className='text-muted-foreground relative z-10 mt-1 truncate text-xs'>
        {props.note}
      </div>
    </div>
  )
}
