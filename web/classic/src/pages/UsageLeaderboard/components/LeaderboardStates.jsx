import React from 'react';
import { Button, Card, Skeleton } from '@douyinfe/semi-ui';
import { Medal, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LeaderboardLoading() {
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton
            key={index}
            loading
            active
            placeholder={<Skeleton.Paragraph rows={3} />}
          />
        ))}
      </div>
      <Skeleton loading active placeholder={<Skeleton.Paragraph rows={12} />} />
    </div>
  );
}

export function LeaderboardError({ message, onRetry }) {
  const { t } = useTranslation();

  return (
    <Card
      bordered={false}
      className='lb-state-card lb-state-error !rounded-2xl text-center'
      bodyStyle={{ padding: '56px 24px' }}
    >
      <RefreshCw
        size={32}
        className='mx-auto text-gray-400'
        aria-hidden='true'
      />
      <h2 className='mt-3 font-bold'>{t('榜单正在短暂蓄力')}</h2>
      <p className='mt-1 text-sm text-gray-500'>{message}</p>
      <Button theme='solid' type='primary' className='mt-4' onClick={onRetry}>
        {t('重新加载')}
      </Button>
    </Card>
  );
}

export function LeaderboardEmpty() {
  const { t } = useTranslation();

  return (
    <Card
      bordered={false}
      className='lb-state-card lb-state-empty !rounded-2xl text-center'
      bodyStyle={{ padding: '64px 24px' }}
    >
      <Medal size={40} className='mx-auto text-amber-500' aria-hidden='true' />
      <h2 className='mt-3 text-lg font-black'>{t('成为榜单上的第一个名字')}</h2>
      <p className='mt-2 text-sm text-gray-500'>
        {t('第一次有效调用，就是你的入榜宣言。空着的王座正在等你。')}
      </p>
    </Card>
  );
}
