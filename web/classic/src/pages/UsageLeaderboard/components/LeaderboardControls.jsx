import React from 'react';
import { Flame, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LEADERBOARD_METRICS, LEADERBOARD_PERIODS } from '../constants';

export function LeaderboardControls({
  period,
  metric,
  onPeriodChange,
  onMetricChange,
}) {
  const { t } = useTranslation();

  return (
    <div className='lb-control-surface flex flex-col gap-3 rounded-2xl p-2.5 shadow-sm sm:flex-row sm:items-center sm:justify-between'>
      <div
        className='lb-segmented flex gap-1 overflow-x-auto rounded-xl p-1'
        role='tablist'
        aria-label={t('排行周期')}
      >
        {LEADERBOARD_PERIODS.map((item) => (
          <button
            type='button'
            role='tab'
            aria-selected={period === item.value}
            key={item.value}
            onClick={() => onPeriodChange(item.value)}
            className={`lb-tab relative h-9 shrink-0 rounded-lg px-3.5 text-xs font-bold ${
              period === item.value
                ? 'lb-tab-active text-white'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {t(item.label)}
          </button>
        ))}
      </div>
      <div
        className='lb-segmented grid grid-cols-2 rounded-xl p-1'
        role='tablist'
        aria-label={t('排行维度')}
      >
        {LEADERBOARD_METRICS.map((item) => (
          <button
            type='button'
            role='tab'
            aria-selected={metric === item.value}
            key={item.value}
            onClick={() => onMetricChange(item.value)}
            className={`lb-tab inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-bold ${
              metric === item.value
                ? 'lb-tab-active text-white'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {item.icon === 'tokens' ? (
              <Zap size={14} aria-hidden='true' />
            ) : (
              <Flame size={14} aria-hidden='true' />
            )}
            {t(item.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
