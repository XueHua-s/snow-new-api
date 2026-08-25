import React from 'react';
import { Tag } from '@douyinfe/semi-ui';
import { ArrowRight, Crown, Target, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatLeaderboardValue } from '../lib/format';
import { ChartCard } from './ChartCard';

function findPreviousRankValue(top, selfRank) {
  for (let index = top.length - 1; index >= 0; index -= 1) {
    if (top[index].rank < selfRank) return top[index].value;
  }
  return undefined;
}

export function GapRoadmap({ board, metric }) {
  const { t } = useTranslation();
  const self = board.self;
  const leader = board.champion;
  const outsideTopTen = self.rank > 10 || !self.ranked;
  let targetValue;
  let gap;
  let targetLabel;

  if (self.rank === 1) {
    targetValue = self.value;
    gap = 0;
    targetLabel = t('王冠防线');
  } else if (outsideTopTen) {
    targetValue = board.top.at(-1)?.value || 0;
    gap = self.gap_to_top_ten;
    targetLabel = t('前十入场线');
  } else {
    targetValue =
      findPreviousRankValue(board.top, self.rank) || leader?.value || 0;
    gap = self.gap_to_previous;
    targetLabel = t('下一名门槛');
  }

  const progress =
    targetValue > 0 ? Math.min((self.value / targetValue) * 100, 100) : 0;

  return (
    <ChartCard
      icon={<Target size={16} className='text-blue-500' aria-hidden='true' />}
      title={t('我的追赶路线图')}
      description={t('把差距变成一个看得见、打得掉的目标。')}
      variant='roadmap'
    >
      <div className='flex min-h-[454px] flex-col justify-between py-2'>
        <div>
          <div className='lb-position-card relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent p-4'>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-xs font-semibold text-gray-500'>
                {t('当前战位')}
              </span>
              <Tag color='blue' shape='circle'>
                {self.ranked ? `#${self.rank}` : t('未上榜')}
              </Tag>
            </div>
            <div className='mt-4 flex items-end justify-between gap-4'>
              <div>
                <div className='font-mono text-2xl font-black'>
                  {formatLeaderboardValue(metric, self.value)}
                </div>
                <div className='mt-1 text-xs text-gray-500'>
                  {self.username} · {t('你')}
                </div>
              </div>
              <Zap
                size={36}
                className='lb-roadmap-flame text-blue-500'
                aria-hidden='true'
              />
            </div>
          </div>
          <div className='mt-6'>
            <div className='mb-2 flex items-center justify-between text-xs font-semibold'>
              <span>{t('突破进度')}</span>
              <span className='font-mono text-blue-600'>
                {progress.toFixed(0)}%
              </span>
            </div>
            <div className='lb-energy-track lb-soft-border relative h-4 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800'>
              <div
                className='lb-energy-fill h-full rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400'
                style={{ width: `${progress}%` }}
              />
              <span className='lb-energy-target' aria-hidden='true' />
            </div>
            <div className='mt-2 flex items-center justify-between text-[11px] text-gray-500'>
              <span>{t('我的当前值')}</span>
              <span>{targetLabel}</span>
            </div>
          </div>
        </div>
        <div className='space-y-3'>
          <div className='lb-milestone lb-soft-border flex items-center gap-3 rounded-xl p-3'>
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${gap === 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-blue-500/10 text-blue-600'}`}
            >
              {gap === 0 ? (
                <Crown size={16} aria-hidden='true' />
              ) : (
                <ArrowRight size={16} aria-hidden='true' />
              )}
            </div>
            <div className='min-w-0'>
              <div className='text-xs font-semibold'>
                {gap === 0 ? t('继续守擂') : t('距离下一里程碑')}
              </div>
              <div className='truncate font-mono text-sm font-black'>
                {gap === 0
                  ? t('你就是全站标杆')
                  : formatLeaderboardValue(metric, gap)}
              </div>
            </div>
          </div>
          <p className='rounded-xl bg-blue-500/10 px-4 py-3 text-sm font-bold leading-5'>
            {gap === 0
              ? t('全榜都在仰望你。趁追兵还没贴近，再把纪录往前推一步。')
              : t(
                  '先别盯着王冠，先抹掉眼前这段差距。每跨一名，王座就更近一步。',
                )}
          </p>
        </div>
      </div>
    </ChartCard>
  );
}
