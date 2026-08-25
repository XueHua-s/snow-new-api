import { memo, useMemo } from 'react'
import { VChart } from '@visactor/react-vchart'
import { BarChart3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useChartTheme } from '@/lib/use-chart-theme'
import { VCHART_OPTION } from '@/lib/vchart'
import {
  USAGE_LEADERBOARD_PERIOD_COPY,
  USAGE_LEADERBOARD_RANK_COLORS,
} from '../constants'
import {
  formatLeaderboardAxisValue,
  formatLeaderboardValue,
} from '../lib/format'
import type {
  UsageLeaderboardBoard,
  UsageLeaderboardMetric,
  UsageLeaderboardPeriod,
} from '../types'
import { ChartCard } from './chart-card'

type TopTenChartProps = {
  board: UsageLeaderboardBoard
  metric: UsageLeaderboardMetric
  period: UsageLeaderboardPeriod
}

function rankColor(entry: UsageLeaderboardBoard['top'][number]): string {
  if (!entry.is_current) {
    return USAGE_LEADERBOARD_RANK_COLORS[entry.rank] ?? '#64748b'
  }
  return entry.rank === 1 ? USAGE_LEADERBOARD_RANK_COLORS[1] : '#2563eb'
}

export const TopTenChart = memo(function TopTenChart(props: TopTenChartProps) {
  const { t } = useTranslation()
  const { resolvedTheme, themeReady } = useChartTheme()
  const values = useMemo(
    () =>
      props.board.top.map((entry) => ({
        ...entry,
        label: entry.is_current
          ? `${entry.username} (${t('You')})`
          : entry.username,
        color: rankColor(entry),
      })),
    [props.board.top, t]
  )
  const spec = useMemo(
    () => ({
      type: 'bar' as const,
      direction: 'horizontal' as const,
      data: [{ id: 'top-ten', values }],
      xField: 'value',
      yField: 'label',
      seriesField: 'label',
      color: {
        specified: Object.fromEntries(
          values.map((row) => [row.label, row.color])
        ),
      },
      legends: { visible: false },
      bar: {
        style: {
          cornerRadius: 6,
          shadowBlur: (datum: { is_current?: boolean }) =>
            datum.is_current ? 12 : 0,
          shadowColor: (datum: { is_current?: boolean }) =>
            datum.is_current ? 'rgba(37, 99, 235, 0.5)' : 'transparent',
        },
        state: {
          hover: {
            shadowBlur: 14,
            shadowColor: 'rgba(59, 130, 246, 0.45)',
          },
        },
      },
      label: {
        visible: true,
        position: 'outside' as const,
        formatMethod: (
          text: string | number,
          datum?: { value?: number; rawValue?: number }
        ) =>
          formatLeaderboardAxisValue(
            props.metric,
            Number(datum?.value ?? datum?.rawValue ?? text)
          ),
        style: { fontSize: 11, fontWeight: 600 },
      },
      axes: [
        {
          orient: 'left' as const,
          label: { style: { fontSize: 11, fontWeight: 600 }, autoLimit: true },
          tick: { visible: false },
          domainLine: { visible: false },
        },
        {
          orient: 'bottom' as const,
          label: {
            formatMethod: (value: number | string) =>
              formatLeaderboardAxisValue(props.metric, Number(value)),
            style: { fontSize: 10 },
          },
          grid: { visible: true, style: { lineDash: [3, 3] } },
        },
      ],
      tooltip: {
        mark: {
          content: [
            {
              key: t('Rank'),
              value: (datum: { rank: number }) => `#${datum.rank}`,
            },
            {
              key: t('Grind value'),
              value: (datum: { value: number }) =>
                formatLeaderboardValue(props.metric, datum.value),
            },
            {
              key: t('Site-wide share'),
              value: (datum: { share: number }) =>
                `${(datum.share * 100).toFixed(1)}%`,
            },
          ],
        },
      },
      animationAppear: { duration: 550 },
    }),
    [props.metric, t, values]
  )
  const selfOutside = props.board.self.ranked && props.board.self.rank > 10
  let outsideRow = null
  if (!props.board.self.ranked) {
    outsideRow = (
      <OutsideRow
        label={t('Your sprint zone')}
        username={props.board.self.username}
        value={t('Make your first effective call to declare your entry.')}
      />
    )
  } else if (selfOutside) {
    outsideRow = (
      <OutsideRow
        label={t('Outside Top 10 · #{{rank}}', {
          rank: props.board.self.rank,
        })}
        username={`${props.board.self.username} (${t('You')})`}
        value={formatLeaderboardValue(props.metric, props.board.self.value)}
      />
    )
  }

  return (
    <ChartCard
      icon={<BarChart3 className='size-4 text-amber-500' aria-hidden />}
      title={t('{{period}} {{metric}} Top 10', {
        period: t(USAGE_LEADERBOARD_PERIOD_COPY[props.period]),
        metric: t(
          props.metric === 'tokens' ? 'Token volume' : 'Spending quota'
        ),
      })}
      description={t(
        'Gold, silver, bronze—and your position highlighted in theme blue.'
      )}
      badge={t('Live site-wide race')}
      variant='podium'
    >
      <div className='lb-default-chart-arena h-[390px] rounded-xl sm:h-[430px]'>
        {themeReady && values.length > 0 ? (
          <VChart
            key={`usage-top-${resolvedTheme}-${props.period}-${props.metric}`}
            spec={{
              ...spec,
              theme: resolvedTheme === 'dark' ? 'dark' : 'light',
              background: 'transparent',
            }}
            option={VCHART_OPTION}
          />
        ) : null}
      </div>
      {outsideRow}
    </ChartCard>
  )
})

function OutsideRow(props: { label: string; username: string; value: string }) {
  return (
    <div className='lb-default-divider relative pt-3'>
      <div className='mb-2 text-[10px] font-bold tracking-widest text-blue-500 uppercase'>
        {props.label}
      </div>
      <div className='lb-default-sprint-row relative flex items-center justify-between gap-3 overflow-hidden rounded-lg bg-blue-500/5 px-3 py-2.5'>
        <span className='lb-default-sprint-scan' aria-hidden />
        <span className='truncate text-sm font-bold'>{props.username}</span>
        <span className='shrink-0 font-mono text-xs font-bold text-blue-600 dark:text-blue-400'>
          {props.value}
        </span>
      </div>
    </div>
  )
}
