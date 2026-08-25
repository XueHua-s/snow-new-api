import { memo, useMemo } from 'react'
import { VChart } from '@visactor/react-vchart'
import { LineChart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useChartTheme } from '@/lib/use-chart-theme'
import { VCHART_OPTION } from '@/lib/vchart'
import { USAGE_LEADERBOARD_TREND_PALETTE } from '../constants'
import {
  formatLeaderboardAxisValue,
  formatLeaderboardBucket,
  formatLeaderboardValue,
} from '../lib/format'
import type {
  UsageLeaderboardBoard,
  UsageLeaderboardMetric,
  UsageLeaderboardPeriod,
} from '../types'
import { ChartCard } from './chart-card'

type TrendChartProps = {
  board: UsageLeaderboardBoard
  metric: UsageLeaderboardMetric
  period: UsageLeaderboardPeriod
}

export const TrendChart = memo(function TrendChart(props: TrendChartProps) {
  const { t } = useTranslation()
  const { resolvedTheme, themeReady } = useChartTheme()
  const chartData = useMemo(() => {
    const values = props.board.trend.map((point) => ({
      ...point,
      time: formatLeaderboardBucket(props.period, point.bucket),
    }))
    const names = new Set<string>()
    let selfName: string | undefined

    for (const point of values) {
      names.add(point.username)
      if (point.is_current) selfName = point.username
    }

    const colors: Record<string, string> = {}
    let index = 0
    for (const name of names) {
      colors[name] =
        name === selfName
          ? '#2563eb'
          : USAGE_LEADERBOARD_TREND_PALETTE[
              index % USAGE_LEADERBOARD_TREND_PALETTE.length
            ]
      index += 1
    }

    return { values, colors }
  }, [props.board.trend, props.period])

  const spec = useMemo(
    () => ({
      type: 'line' as const,
      data: [{ id: 'cumulative-trend', values: chartData.values }],
      xField: 'time',
      yField: 'value',
      seriesField: 'username',
      color: { specified: chartData.colors },
      point: {
        visible: chartData.values.length < 100,
        style: { size: 5 },
      },
      line: { style: { lineWidth: 3 } },
      legends: {
        visible: true,
        orient: 'top' as const,
        position: 'start' as const,
        item: { label: { style: { fontSize: 11 } } },
      },
      axes: [
        {
          orient: 'bottom' as const,
          label: { style: { fontSize: 10 }, autoHide: true, autoLimit: true },
          tick: { visible: false },
        },
        {
          orient: 'left' as const,
          label: {
            formatMethod: (value: number | string) =>
              formatLeaderboardAxisValue(props.metric, Number(value)),
            style: { fontSize: 10 },
          },
          grid: { visible: true, style: { lineDash: [3, 3] } },
        },
      ],
      tooltip: {
        dimension: {
          title: { value: (datum: { time: string }) => datum.time },
          content: [
            {
              key: (datum: { username: string }) => datum.username,
              value: (datum: { value: number }) =>
                formatLeaderboardValue(props.metric, datum.value),
            },
          ],
        },
      },
      animationAppear: { duration: 550 },
    }),
    [chartData, props.metric]
  )

  return (
    <ChartCard
      icon={<LineChart className='size-4 text-blue-500' aria-hidden />}
      title={t('Cumulative grind race')}
      description={t(
        'Top 5 plus you: see who accelerated, who held pace, and where the gap opened.'
      )}
      badge={t('Lead paths generating live')}
      variant='race'
    >
      <div className='lb-default-chart-arena h-[320px] rounded-xl sm:h-[380px]'>
        {themeReady && chartData.values.length > 0 ? (
          <VChart
            key={`usage-trend-${resolvedTheme}-${props.period}-${props.metric}`}
            spec={{
              ...spec,
              theme: resolvedTheme === 'dark' ? 'dark' : 'light',
              background: 'transparent',
            }}
            option={VCHART_OPTION}
          />
        ) : (
          <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
            {t('Trend data is building up. Keep calling and come back soon.')}
          </div>
        )}
      </div>
    </ChartCard>
  )
})
