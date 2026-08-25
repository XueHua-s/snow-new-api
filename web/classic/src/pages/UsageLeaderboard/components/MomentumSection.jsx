import React from 'react';
import { Card } from '@douyinfe/semi-ui';
import { Flame, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LEADERBOARD_PARTICLES, LEADERBOARD_PERIOD_COPY } from '../constants';
import { formatLeaderboardValue } from '../lib/format';

export function MomentumSection({ board, metric, period }) {
  const { t } = useTranslation();
  const self = board.self;
  const gap =
    !self.ranked || self.rank > 10 ? self.gap_to_top_ten : self.gap_to_previous;
  let callout;

  if (self.rank === 1) {
    callout = t('你定义了当前周期的速度。继续守擂，把领先变成护城河。');
  } else if (!self.ranked || self.rank > 10) {
    callout = t('再前进 {{gap}}，你就能杀入前十。', {
      gap: formatLeaderboardValue(metric, gap),
    });
  } else {
    callout = t('距离上一名只差 {{gap}}，下一席已经进入射程。', {
      gap: formatLeaderboardValue(metric, gap),
    });
  }

  return (
    <section className='lb-momentum-grid grid min-w-0 grid-cols-1 gap-4'>
      <StatCard
        icon={<Trophy size={16} aria-hidden='true' />}
        label={t('我的当前排名')}
        value={self.ranked ? `#${self.rank}` : t('未上榜')}
        note={self.rank === 1 ? t('正在加冕') : t('你在全站的真实位置')}
        accent={self.rank === 1 ? 'gold' : 'blue'}
        energy={self.rank === 1 ? 'champion' : 'chase'}
      />
      <StatCard
        icon={<Zap size={16} aria-hidden='true' />}
        label={t('我的内卷值')}
        value={formatLeaderboardValue(metric, self.value)}
        note={t('已超越 {{percent}}% 的活跃用户', {
          percent: self.surpassed_percent.toFixed(0),
        })}
        energy='data'
      />
      <StatCard
        icon={<Target size={16} aria-hidden='true' />}
        label={t('下一个突破口')}
        value={
          self.rank === 1 ? t('守住第一') : formatLeaderboardValue(metric, gap)
        }
        note={t('目标越具体，行动越有力')}
        energy='target'
      />
      <DeclarationCard callout={callout} period={period} />
    </section>
  );
}

function DeclarationCard({ callout, period }) {
  const { t } = useTranslation();

  return (
    <div className='lb-declaration relative isolate overflow-hidden rounded-2xl p-4'>
      <div className='lb-declaration-grid' aria-hidden='true' />
      <div className='lb-declaration-sweep' aria-hidden='true' />
      <Flame
        className='lb-declaration-flame absolute -right-2 -bottom-4'
        size={92}
        aria-hidden='true'
      />
      <div className='lb-particles' aria-hidden='true'>
        {LEADERBOARD_PARTICLES.map((particle) => (
          <span
            key={`${particle.x}-${particle.y}`}
            className='lb-particle'
            style={{
              '--lb-x': particle.x,
              '--lb-y': particle.y,
              '--lb-size': `${particle.size}px`,
              '--lb-delay': particle.delay,
            }}
          />
        ))}
      </div>
      <div className='relative z-10'>
        <div className='flex items-center gap-2 text-xs font-black tracking-wide text-blue-700 dark:text-blue-300'>
          <span className='lb-live-dot' aria-hidden='true' />
          {t('{{period}}冲榜宣言', {
            period: t(LEADERBOARD_PERIOD_COPY[period]),
          })}
        </div>
        <p className='lb-declaration-copy mt-2 text-sm font-black leading-5'>
          {callout}
        </p>
        <div className='mt-3 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.16em] text-violet-600/80 dark:text-violet-300/80'>
          <Sparkles size={12} aria-hidden='true' />
          {t('王座不会等待，优势只属于持续行动的人')}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, note, accent, energy }) {
  let accentClass = 'text-gray-500';
  if (accent === 'gold') accentClass = 'text-amber-600';
  else if (accent === 'blue') accentClass = 'text-blue-600';

  return (
    <Card
      bordered={false}
      className={`lb-stat-card !rounded-2xl lb-stat-${energy}`}
      bodyStyle={{ padding: 16 }}
    >
      <span className='lb-stat-glint' aria-hidden='true' />
      <div
        className={`relative z-10 flex items-center gap-2 text-xs font-semibold ${accentClass}`}
      >
        {icon}
        {label}
      </div>
      <div className='relative z-10 mt-2 truncate font-mono text-xl font-black'>
        {value}
      </div>
      <div className='relative z-10 mt-1 truncate text-xs text-gray-500'>
        {note}
      </div>
    </Card>
  );
}
