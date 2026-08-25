import React, { memo, useMemo } from 'react';
import { VChart } from '@visactor/react-vchart';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActualTheme } from '../../../context/Theme';
import {
  LEADERBOARD_CHART_OPTION,
  LEADERBOARD_PERIOD_COPY,
  LEADERBOARD_RANK_COLORS,
} from '../constants';
import {
  formatLeaderboardAxisValue,
  formatLeaderboardValue,
} from '../lib/format';
import { ChartCard } from './ChartCard';

function rankColor(entry) {
  if (!entry.is_current) {
    return LEADERBOARD_RANK_COLORS[entry.rank] || '#64748b';
  }
  return entry.rank === 1 ? LEADERBOARD_RANK_COLORS[1] : '#2563eb';
}

export const TopTenChart = memo(function TopTenChart({
  board,
  metric,
  period,
}) {
  const { t } = useTranslation();
  const theme = useActualTheme();
  const values = useMemo(
    () =>
      board.top.map((entry) => ({
        ...entry,
        label: entry.is_current
          ? `${entry.username} (${t('你')})`
          : entry.username,
        color: rankColor(entry),
      })),
    [board.top, t],
  );
  const spec = useMemo(
    () => ({
      type: 'bar',
      direction: 'horizontal',
      data: [{ id: 'top-ten', values }],
      xField: 'value',
      yField: 'label',
      seriesField: 'label',
      color: {
        specified: Object.fromEntries(
          values.map((row) => [row.label, row.color]),
        ),
      },
      legends: { visible: false },
      bar: {
        style: {
          cornerRadius: 6,
          shadowBlur: (datum) => (datum.is_current ? 12 : 0),
          shadowColor: (datum) =>
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
        position: 'outside',
        // VChart passes the rendered text first and the data row second.
        formatMethod: (text, datum) =>
          formatLeaderboardAxisValue(
            metric,
            datum?.value ?? datum?.rawValue ?? text,
          ),
        style: { fontSize: 11, fontWeight: 600 },
      },
      axes: [
        {
          orient: 'left',
          label: { style: { fontSize: 11, fontWeight: 600 }, autoLimit: true },
          tick: { visible: false },
          domainLine: { visible: false },
        },
        {
          orient: 'bottom',
          label: {
            formatMethod: (value) => formatLeaderboardAxisValue(metric, value),
            style: { fontSize: 10 },
          },
          grid: { visible: true, style: { lineDash: [3, 3] } },
        },
      ],
      tooltip: {
        mark: {
          content: [
            { key: t('排名'), value: (datum) => `#${datum.rank}` },
            {
              key: t('内卷值'),
              value: (datum) => formatLeaderboardValue(metric, datum.value),
            },
            {
              key: t('全站占比'),
              value: (datum) => `${(datum.share * 100).toFixed(1)}%`,
            },
          ],
        },
      },
      theme: theme === 'dark' ? 'dark' : 'light',
      background: 'transparent',
      animationAppear: { duration: 550 },
    }),
    [metric, t, theme, values],
  );
  const selfOutside = board.self.ranked && board.self.rank > 10;
  let outsideRow = null;
  if (!board.self.ranked) {
    outsideRow = (
      <OutsideRow
        label={t('你的冲刺区')}
        username={board.self.username}
        value={t('第一次有效调用，就是你的入榜宣言。')}
      />
    );
  } else if (selfOutside) {
    outsideRow = (
      <OutsideRow
        label={t('榜外冲刺区 · #{{rank}}', { rank: board.self.rank })}
        username={`${board.self.username} (${t('你')})`}
        value={formatLeaderboardValue(metric, board.self.value)}
      />
    );
  }

  return (
    <ChartCard
      icon={
        <BarChart3 size={16} className='text-amber-500' aria-hidden='true' />
      }
      title={t('{{period}}{{metric}}内卷榜 Top 10', {
        period: t(LEADERBOARD_PERIOD_COPY[period]),
        metric: metric === 'tokens' ? ' Token ' : t('消费额度'),
      })}
      description={t('金银铜标记前三，你的位置用主题蓝高亮。')}
      variant='podium'
    >
      <div className='lb-chart-arena lb-chart-arena-bars h-[420px] rounded-xl'>
        <VChart
          key={`usage-top-${theme}-${period}-${metric}`}
          spec={spec}
          option={LEADERBOARD_CHART_OPTION}
        />
      </div>
      {outsideRow}
    </ChartCard>
  );
});

function OutsideRow({ label, username, value }) {
  return (
    <div className='lb-soft-divider relative pt-3'>
      <div className='mb-2 text-[10px] font-bold tracking-widest text-blue-500'>
        {label}
      </div>
      <div className='lb-sprint-row relative flex items-center justify-between gap-3 overflow-hidden rounded-lg bg-blue-500/5 px-3 py-2.5'>
        <span className='lb-sprint-scan' aria-hidden='true' />
        <span className='truncate text-sm font-bold'>{username}</span>
        <span className='shrink-0 font-mono text-xs font-bold text-blue-600'>
          {value}
        </span>
      </div>
    </div>
  );
}
