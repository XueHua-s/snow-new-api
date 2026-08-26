import { ArrowRight, Crown, Target, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatLeaderboardValue } from '../lib/format'
import type { UsageLeaderboardBoard, UsageLeaderboardMetric } from '../types'
import { ChartCard } from './chart-card'

type GapRoadmapProps = {
  board: UsageLeaderboardBoard
  metric: UsageLeaderboardMetric
}

function findPreviousRankValue(
  top: UsageLeaderboardBoard['top'],
  selfRank: number
): number | undefined {
  for (let index = top.length - 1; index >= 0; index -= 1) {
    if (top[index].rank < selfRank) return top[index].value
  }
  return undefined
}

export function GapRoadmap(props: GapRoadmapProps) {
  const { t } = useTranslation()
  const self = props.board.self
  const leader = props.board.champion
  const outsideTopTen = self.rank > 10 || !self.ranked
  let targetValue: number
  let gap: number
  let targetLabel: string

  if (self.rank === 1) {
    targetValue = self.value
    gap = 0
    targetLabel = t('Crown defense line')
  } else if (outsideTopTen) {
    targetValue = props.board.top.at(-1)?.value ?? 0
    gap = self.gap_to_top_ten
    targetLabel = t('Top 10 entry line')
  } else {
    targetValue =
      findPreviousRankValue(props.board.top, self.rank) ?? leader?.value ?? 0
    gap = self.gap_to_previous
    targetLabel = t('Next rank line')
  }

  const progress =
    targetValue > 0 ? Math.min((self.value / targetValue) * 100, 100) : 0

  return (
    <ChartCard
      icon={<Target className='size-4 text-blue-500' aria-hidden />}
      title={t('My breakthrough roadmap')}
      description={t('Turn the distance into one visible, beatable target.')}
      variant='roadmap'
    >
      <div className='flex min-h-[390px] flex-col justify-between py-2 sm:min-h-[430px]'>
        <div>
          <div className='lb-default-position-card relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent p-4'>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground text-xs font-semibold'>
                {t('Current position')}
              </span>
              <span className='rounded-full bg-blue-600 px-2.5 py-1 text-xs font-black text-white'>
                {self.ranked ? `#${self.rank}` : t('Unranked')}
              </span>
            </div>
            <div className='mt-4 flex items-end justify-between gap-4'>
              <div>
                <div className='font-mono text-2xl font-black'>
                  {formatLeaderboardValue(props.metric, self.value)}
                </div>
                <div className='text-muted-foreground mt-1 text-xs'>
                  {self.username} · {t('You')}
                </div>
              </div>
              <Zap
                className='lb-default-roadmap-zap size-9 text-blue-500'
                aria-hidden
              />
            </div>
          </div>

          <div className='mt-6'>
            <div className='mb-2 flex items-center justify-between text-xs font-semibold'>
              <span>{t('Breakthrough progress')}</span>
              <span className='font-mono text-blue-600 dark:text-blue-400'>
                {progress.toFixed(0)}%
              </span>
            </div>
            <div className='lb-default-energy-track bg-muted relative h-4 overflow-hidden rounded-full'>
              <div
                className='lb-default-energy-fill h-full rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 transition-[width]'
                style={{ width: `${progress}%` }}
              />
              <span className='lb-default-energy-target' aria-hidden />
            </div>
            <div className='text-muted-foreground mt-2 flex items-center justify-between text-[11px]'>
              <span>{t('My current value')}</span>
              <span>{targetLabel}</span>
            </div>
          </div>
        </div>

        <div className='space-y-3'>
          <div className='lb-default-milestone flex items-center gap-3 rounded-xl p-3'>
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                gap === 0
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
              )}
            >
              {gap === 0 ? (
                <Crown className='size-4' aria-hidden />
              ) : (
                <ArrowRight className='size-4' aria-hidden />
              )}
            </div>
            <div className='min-w-0'>
              <div className='text-xs font-semibold'>
                {gap === 0
                  ? t('Keep the throne')
                  : t('Distance to next milestone')}
              </div>
              <div className='truncate font-mono text-sm font-black'>
                {gap === 0
                  ? t('You are the benchmark')
                  : formatLeaderboardValue(props.metric, gap)}
              </div>
            </div>
          </div>
          <p className='rounded-xl bg-blue-500/10 px-4 py-3 text-sm leading-5 font-bold'>
            {gap === 0
              ? t(
                  'The leaderboard is looking up at you. Add another result before anyone closes in.'
                )
              : t(
                  'Do not stare at the crown—erase the next gap first. One milestone at a time, the throne gets closer.'
                )}
          </p>
        </div>
      </div>
    </ChartCard>
  )
}
