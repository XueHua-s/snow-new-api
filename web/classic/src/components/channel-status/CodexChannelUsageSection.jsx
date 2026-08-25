/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { memo } from 'react';
import {
  Banner,
  Button,
  Card,
  Collapse,
  Empty,
  Progress,
  Skeleton,
  Tag,
} from '@douyinfe/semi-ui';
import { KeyRound, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCodexChannelUsage } from '../../hooks/channel-status/useCodexChannelUsage';

const clampPercent = (value) => {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, percent));
};

const getUsageColor = (value) => {
  const percent = clampPercent(value);
  if (percent >= 95) return '#ef4444';
  if (percent >= 80) return '#f59e0b';
  return '#3b82f6';
};

const getChannelStatusPresentation = (channel, t) => {
  if (channel.error) {
    return { label: t('暂不可用'), color: 'red' };
  }
  if (channel.available === true) {
    return { label: t('可用'), color: 'green' };
  }
  if (channel.available === false) {
    return { label: t('受限'), color: 'red' };
  }
  return { label: t('待确认'), color: 'grey' };
};

const getPlanPresentation = (value, t) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  const plans = {
    enterprise: { label: 'Enterprise', color: 'green' },
    team: { label: 'Team', color: 'cyan' },
    pro: { label: 'Pro', color: 'blue' },
    plus: { label: 'Plus', color: 'violet' },
    free: { label: 'Free', color: 'amber' },
  };
  return (
    plans[normalized] || {
      label: String(value || '').trim() || t('未识别'),
      color: 'grey',
    }
  );
};

const formatUnixSeconds = (value) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  return new Date(seconds * 1000).toLocaleString();
};

const formatDuration = (value, t) => {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '-';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  if (hours > 0) return `${hours}${t('小时')} ${minutes}${t('分钟')}`;
  if (minutes > 0) {
    return `${minutes}${t('分钟')} ${remainingSeconds}${t('秒')}`;
  }
  return `${remainingSeconds}${t('秒')}`;
};

const UsageSummary = ({ label, windowData }) => {
  const percent = clampPercent(windowData?.used_percent);
  return (
    <div className='flex min-w-[110px] items-center gap-2 rounded-lg bg-semi-color-fill-0 px-2.5 py-1.5'>
      <span className='whitespace-nowrap text-[11px] text-semi-color-text-2'>
        {label}
      </span>
      <div className='h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-semi-color-fill-1'>
        <div
          className='h-full rounded-full transition-[width]'
          style={{
            width: windowData ? `${percent}%` : '0%',
            background: getUsageColor(percent),
          }}
        />
      </div>
      <span className='min-w-7 text-right text-xs font-semibold tabular-nums text-semi-color-text-0'>
        {windowData ? `${percent}%` : '—'}
      </span>
    </div>
  );
};

const UsageWindowCard = ({ title, windowData, t }) => {
  const percent = clampPercent(windowData?.used_percent);
  return (
    <div className='rounded-xl border border-semi-color-border bg-semi-color-bg-0 p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='text-sm font-semibold text-semi-color-text-0'>
            {title}
          </div>
          <div className='mt-1 text-[11px] text-semi-color-text-2'>
            {t('重置时间：')}
            {formatUnixSeconds(windowData?.reset_at)}
          </div>
        </div>
        <span className='text-sm font-bold tabular-nums text-semi-color-text-0'>
          {windowData ? `${percent}%` : '—'}
        </span>
      </div>
      <div className='mt-3'>
        <Progress
          percent={windowData ? percent : 0}
          stroke={getUsageColor(percent)}
          showInfo={false}
          aria-label={`${title} ${windowData ? `${percent}%` : '-'}`}
        />
      </div>
      <div className='mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-semi-color-text-2'>
        <span>
          {t('距离重置：')}
          {formatDuration(windowData?.reset_after_seconds, t)}
        </span>
        <span>
          {t('窗口：')}
          {formatDuration(windowData?.limit_window_seconds, t)}
        </span>
      </div>
    </div>
  );
};

const UsageWindowGrid = ({ group, t }) => (
  <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
    <UsageWindowCard
      title={t('5小时窗口')}
      windowData={group?.five_hour_window}
      t={t}
    />
    <UsageWindowCard
      title={t('每周窗口')}
      windowData={group?.weekly_window}
      t={t}
    />
  </div>
);

const ChannelHeader = memo(({ channel, t }) => {
  const plan = getPlanPresentation(channel.plan_type, t);
  const status = getChannelStatusPresentation(channel, t);

  return (
    <div className='flex min-w-0 flex-1 flex-col gap-2 py-1 xl:flex-row xl:items-center xl:justify-between'>
      <div className='min-w-0'>
        <div className='truncate text-sm font-semibold text-semi-color-text-0'>
          {channel.name}
        </div>
        <div className='mt-2 flex flex-wrap items-center gap-2'>
          <Tag
            color={plan.color}
            type='light'
            shape='circle'
            size='large'
            className='font-semibold'
          >
            {plan.label}
          </Tag>
          <Tag color={status.color} type='light'>
            {status.label}
          </Tag>
          <Tag color='grey' type='light' shape='circle'>
            {t('上游状态码：')}
            {channel.upstream_status || '-'}
          </Tag>
        </div>
      </div>
      <div className='flex flex-wrap items-center gap-2 pr-2'>
        <UsageSummary
          label={t('5小时')}
          windowData={channel.base_limit?.five_hour_window}
        />
        <UsageSummary
          label={t('每周')}
          windowData={channel.base_limit?.weekly_window}
        />
      </div>
    </div>
  );
});

ChannelHeader.displayName = 'ChannelHeader';

const ChannelDetails = ({ channel, t }) => (
  <div className='space-y-5 px-1 pb-2 pt-1'>
    {channel.error && (
      <Banner
        type='warning'
        className='!rounded-xl'
        description={t('该渠道的 OAuth 用量暂时无法获取，请稍后刷新')}
        closeIcon={null}
      />
    )}
    <section className='space-y-3'>
      <div>
        <div className='text-sm font-semibold text-semi-color-text-0'>
          {t('基础额度')}
        </div>
        <div className='mt-1 text-xs text-semi-color-text-2'>
          {t('当前帐号的基础额度窗口')}
        </div>
      </div>
      <UsageWindowGrid group={channel.base_limit} t={t} />
    </section>

    {channel.additional_limits?.length > 0 && (
      <section className='space-y-4 border-t border-semi-color-border pt-4'>
        <div>
          <div className='text-sm font-semibold text-semi-color-text-0'>
            {t('附加额度')}
          </div>
          <div className='mt-1 text-xs text-semi-color-text-2'>
            {t('按模型或能力拆分的附加计费能力窗口')}
          </div>
        </div>
        {channel.additional_limits.map((group, index) => (
          <div
            key={`${group.name}-${group.metered_feature}-${index}`}
            className={
              index > 0 ? 'border-t border-semi-color-border pt-4' : ''
            }
          >
            <div className='mb-3 flex flex-wrap items-center gap-2'>
              <span className='text-sm font-semibold text-semi-color-text-0'>
                {group.name ||
                  group.metered_feature ||
                  `${t('附加额度')} ${index + 1}`}
              </span>
              {group.metered_feature && (
                <Tag color='grey' type='light' shape='circle'>
                  <span className='font-mono'>{group.metered_feature}</span>
                </Tag>
              )}
            </div>
            <UsageWindowGrid group={group} t={t} />
          </div>
        ))}
      </section>
    )}
  </div>
);

const UsageLoading = () => (
  <div className='space-y-2 p-4'>
    {[0, 1].map((item) => (
      <div
        key={item}
        className='rounded-xl border border-semi-color-border p-4'
      >
        <Skeleton
          active
          placeholder={
            <div className='space-y-3'>
              <Skeleton.Title style={{ width: '30%' }} />
              <Skeleton.Paragraph rows={1} />
            </div>
          }
        />
      </div>
    ))}
  </div>
);

const CodexChannelUsageSection = () => {
  const { t } = useTranslation();
  const { data, loading, error, refresh } = useCodexChannelUsage();
  const channels = data?.channels || [];
  const updatedAt = data?.updated_at
    ? new Date(data.updated_at * 1000).toLocaleTimeString([], { hour12: false })
    : '—';

  return (
    <section className='mt-5' aria-labelledby='codex-channel-usage-title'>
      <Card
        className='overflow-hidden border-0 !rounded-2xl bg-semi-color-bg-0'
        bodyStyle={{ padding: 0 }}
      >
        <div className='flex flex-col gap-3 border-b border-semi-color-border p-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-start gap-3'>
            <div className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-semi-color-primary-light-default text-semi-color-primary'>
              <KeyRound size={19} />
            </div>
            <div>
              <div
                id='codex-channel-usage-title'
                className='text-base font-bold text-semi-color-text-0'
              >
                {t('Codex 渠道用量')}
              </div>
              <div className='mt-1 text-xs text-semi-color-text-2'>
                {t('仅展示 OAuth 渠道；展开查看基础额度与附加能力窗口')}
              </div>
            </div>
          </div>
          <div className='flex items-center gap-2 self-end sm:self-auto'>
            <span className='text-xs tabular-nums text-semi-color-text-2'>
              {t('更新于')} {updatedAt}
            </span>
            <Button
              size='small'
              type='tertiary'
              theme='outline'
              icon={
                <RefreshCw
                  size={14}
                  className={loading ? 'animate-spin' : ''}
                />
              }
              onClick={refresh}
              disabled={loading}
            >
              {t('刷新')}
            </Button>
          </div>
        </div>

        {loading && !data ? (
          <UsageLoading />
        ) : error ? (
          <div className='p-4'>
            <Banner
              type='danger'
              className='!rounded-xl'
              description={t('无法获取 Codex OAuth 渠道用量')}
              closeIcon={null}
            />
          </div>
        ) : channels.length === 0 ? (
          <div className='p-5'>
            <Empty
              title={t('暂无 Codex OAuth 渠道')}
              description={t('普通 API Key 与额度类渠道不会显示在这里')}
            />
          </div>
        ) : (
          <Collapse className='border-0 bg-transparent'>
            {channels.map((channel, index) => (
              <Collapse.Panel
                key={`${channel.name}-${index}`}
                itemKey={`codex-channel-${index}`}
                header={<ChannelHeader channel={channel} t={t} />}
              >
                <ChannelDetails channel={channel} t={t} />
              </Collapse.Panel>
            ))}
          </Collapse>
        )}
      </Card>
    </section>
  );
};

export default CodexChannelUsageSection;
