import React, { memo, useMemo } from 'react';
import { VChart } from '@visactor/react-vchart';
import { LineChart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActualTheme } from '../../../context/Theme';
import {
  LEADERBOARD_CHART_OPTION,
  LEADERBOARD_TREND_PALETTE,
} from '../constants';
import {
  formatLeaderboardAxisValue,
  formatLeaderboardBucket,
  formatLeaderboardValue,
} from '../lib/format';
import { ChartCard } from './ChartCard';

export const TrendChart = memo(function TrendChart({ board, metric, period }) {
  const { t } = useTranslation();
  const theme = useActualTheme();
  const chartData = useMemo(() => {
    const values = board.trend.map((point) => ({
      ...point,
      time: formatLeaderboardBucket(period, point.bucket),
    }));
    const names = new Set();
    let selfName;

    for (const point of values) {
      names.add(point.username);
      if (point.is_current) selfName = point.username;
    }

    const colors = {};
    let index = 0;
    for (const name of names) {
      colors[name] =
        name === selfName
          ? '#2563eb'
          : LEADERBOARD_TREND_PALETTE[index % LEADERBOARD_TREND_PALETTE.length];
      index += 1;
    }

    return { values, colors };
  }, [board.trend, period]);

  const spec = useMemo(
    () => ({
      type: 'line',
      data: [{ id: 'cumulative-trend', values: chartData.values }],
      xField: 'time',
      yField: 'value',
      seriesField: 'username',
      color: { specified: chartData.colors },
      point: { visible: chartData.values.length < 100, style: { size: 5 } },
      line: { style: { lineWidth: 3 } },
      legends: {
        visible: true,
        orient: 'top',
        position: 'start',
        item: { label: { style: { fontSize: 11 } } },
      },
      axes: [
        {
          orient: 'bottom',
          label: { style: { fontSize: 10 }, autoHide: true, autoLimit: true },
          tick: { visible: false },
        },
        {
          orient: 'left',
          label: {
            formatMethod: (value) => formatLeaderboardAxisValue(metric, value),
            style: { fontSize: 10 },
          },
          grid: { visible: true, style: { lineDash: [3, 3] } },
        },
      ],
      tooltip: {
        dimension: {
          title: { value: (datum) => datum.time },
          content: [
            {
              key: (datum) => datum.username,
              value: (datum) => formatLeaderboardValue(metric, datum.value),
            },
          ],
        },
      },
      theme: theme === 'dark' ? 'dark' : 'light',
      background: 'transparent',
      animationAppear: { duration: 550 },
    }),
    [chartData, metric, theme],
  );

  return (
    <ChartCard
      icon={
        <LineChart size={16} className='text-blue-500' aria-hidden='true' />
      }
      title={t('累计内卷竞速')}
      description={t(
        'Top 5 加上你：谁在加速、谁在守势、差距在哪一刻拉开，一眼看清。',
      )}
      badge={t('领先轨迹持续生成')}
      variant='race'
    >
      <div className='lb-chart-arena lb-chart-arena-trend h-[360px] rounded-xl'>
        {chartData.values.length > 0 ? (
          <VChart
            key={`usage-trend-${theme}-${period}-${metric}`}
            spec={spec}
            option={LEADERBOARD_CHART_OPTION}
          />
        ) : (
          <div className='flex h-full items-center justify-center text-sm text-gray-500'>
            {t('趋势正在积累。继续调用，稍后回来见证曲线上扬。')}
          </div>
        )}
      </div>
    </ChartCard>
  );
});
