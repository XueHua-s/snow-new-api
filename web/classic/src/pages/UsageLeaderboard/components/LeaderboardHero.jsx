import React from 'react';
import { Skeleton } from '@douyinfe/semi-ui';
import { Crown, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LEADERBOARD_PARTICLES, LEADERBOARD_PERIOD_COPY } from '../constants';
import { formatLeaderboardValue } from '../lib/format';

export function LeaderboardHero({ board, period, metric, loading }) {
  const { t } = useTranslation();
  const champion = board?.champion;
  const selfIsChampion = champion?.is_current === true;
  let title;
  if (selfIsChampion) {
    title = t('你已加冕{{period}}内卷之王', {
      period: t(LEADERBOARD_PERIOD_COPY[period]),
    });
  } else if (champion) {
    title = t('王座暂由 {{username}} 占据', {
      username: champion.username,
    });
  } else {
    title = t('王座正在等待第一位挑战者');
  }

  return (
    <section
      className={`lb-hero relative isolate overflow-hidden rounded-2xl p-5 sm:p-7 ${selfIsChampion ? 'lb-hero-self-champion' : ''}`}
    >
      <div className='lb-hero-orbit' aria-hidden='true' />
      <div className='lb-hero-streak' aria-hidden='true' />
      <div aria-hidden='true'>
        {LEADERBOARD_PARTICLES.slice(0, 6).map((particle) => (
          <span
            key={`${particle.x}-${particle.y}`}
            className='lb-hero-spark'
            style={{
              '--lb-x': particle.x,
              '--lb-y': particle.y,
              '--lb-delay': particle.delay,
            }}
          />
        ))}
      </div>
      <div
        className='absolute -top-20 -right-16 h-60 w-60 rounded-full bg-amber-400/15 blur-3xl'
        aria-hidden='true'
      />
      <div className='lb-hero-content relative flex flex-col gap-5'>
        <div className='max-w-2xl'>
          <div className='lb-hero-badge inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300'>
            <Sparkles size={14} aria-hidden='true' />
            {t('每一次调用都算数，每一个 Token 都留下痕迹')}
          </div>
          <h1 className='mt-3 text-2xl font-black tracking-tight sm:text-3xl'>
            {title}
          </h1>
          <p className='mt-2 text-sm leading-6 text-gray-500 sm:text-base dark:text-gray-400'>
            {selfIsChampion
              ? t(
                  '王冠已经戴上，但身后全是追兵。守住领先，把纪录推到更难企及。',
                )
              : t(
                  '差距不是高墙，而是下一个清晰里程碑。再完成一次有效调用，让进度条继续向前。',
                )}
          </p>
        </div>
        <div className='lb-champion-card flex min-w-[240px] items-center gap-4 rounded-xl bg-white/75 p-4 backdrop-blur dark:bg-black/20'>
          <div className='lb-crown-orb relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow-lg'>
            <span className='lb-crown-ring' aria-hidden='true' />
            <Crown
              className='lb-crown-icon relative z-10'
              size={28}
              aria-hidden='true'
            />
          </div>
          <div className='min-w-0'>
            <div className='text-[11px] font-bold tracking-widest text-gray-500 uppercase'>
              {t('{{period}}冠军', {
                period: t(LEADERBOARD_PERIOD_COPY[period]),
              })}
            </div>
            {loading ? (
              <Skeleton.Paragraph rows={1} style={{ width: 120 }} />
            ) : champion ? (
              <>
                <div className='truncate text-lg font-black'>
                  {champion.username}
                </div>
                <div className='font-mono text-sm font-bold text-amber-600 dark:text-amber-400'>
                  {formatLeaderboardValue(metric, champion.value)}
                </div>
              </>
            ) : (
              <div className='text-sm font-semibold'>{t('虚位以待')}</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
