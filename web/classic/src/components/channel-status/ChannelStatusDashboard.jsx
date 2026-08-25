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

import React, { memo, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Empty,
  Progress,
  Skeleton,
  Tag,
} from '@douyinfe/semi-ui';
import { Activity, Clock3, Gauge, Radio, Timer, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChannelStatusSocket } from '../../hooks/channel-status/useChannelStatusSocket';
import CodexChannelUsageSection from './CodexChannelUsageSection';
import {
  CHANNEL_STATUS_WINDOWS,
  formatTTFT,
  getHealthColor,
  getSuccessTone,
  getVisibleErrors,
  groupChannelStatusModels,
} from '../../helpers/channel-status';

const CONNECTION_PRESENTATION = {
  connected: { color: 'green', label: '已连接' },
  connecting: { color: 'blue', label: '连接中' },
  reconnecting: { color: 'orange', label: '正在重连' },
};

const SummaryCard = ({ icon, label, metric, accent }) => (
  <Card
    className='border-0 !rounded-2xl bg-semi-color-bg-0'
    bodyStyle={{ padding: 16 }}
  >
    <div className='flex items-start justify-between gap-3'>
      <div>
        <div className='text-xs font-medium text-semi-color-text-2'>
          {label}
        </div>
        <div className='mt-2 flex items-baseline gap-1 text-semi-color-text-0'>
          <span className='text-2xl font-bold tracking-tight'>
            {metric.value}
          </span>
          <span className='text-xs font-medium text-semi-color-text-2'>
            {metric.unit}
          </span>
        </div>
      </div>
      <div
        className='flex h-9 w-9 items-center justify-center rounded-xl'
        style={{
          background: `color-mix(in srgb, ${accent} 13%, transparent)`,
          color: accent,
        }}
      >
        {icon}
      </div>
    </div>
  </Card>
);

const ModelCard = memo(({ model, sevenDay, t }) => {
  const noRequests = model.request_state === 'no_requests';
  const allFailed = model.request_state === 'all_failed';
  const successRate = Number(model.success_rate || 0);
  const errors = getVisibleErrors(model.last_errors);
  const averageTTFT = formatTTFT(model.avg_ttft_ms);
  const responseTime =
    model.avg_resp_sec > 0 ? `${model.avg_resp_sec.toFixed(1)}s` : '—';
  const successLabel = noRequests
    ? t('近期无请求')
    : allFailed
      ? t('全部失败')
      : `${t(sevenDay ? '7天可用性' : '成功率')} ${successRate.toFixed(1)}%`;

  return (
    <div
      className='flex min-h-[170px] flex-col rounded-xl border border-semi-color-border bg-semi-color-bg-0 p-3 transition-shadow hover:shadow-sm'
      aria-label={model.model}
    >
      <div className='flex min-w-0 items-start justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            className='h-2 w-2 flex-shrink-0 rounded-full'
            style={{ background: getHealthColor(model.health) }}
          />
          <span
            className='truncate text-sm font-semibold text-semi-color-text-0'
            title={model.model}
          >
            {model.model}
          </span>
        </div>
        <Tag color={getSuccessTone(model)} size='small' shape='circle'>
          {successLabel}
        </Tag>
      </div>

      <div className='mt-3'>
        <Progress
          percent={noRequests ? 0 : successRate}
          showInfo={false}
          stroke={getHealthColor(model.health)}
          aria-label={`${model.model} ${successLabel}`}
        />
      </div>

      <div className='mt-3 grid grid-cols-2 gap-2'>
        <div className='rounded-lg bg-semi-color-fill-0 px-3 py-2'>
          <div className='text-[11px] text-semi-color-text-2'>
            {noRequests ? t('状态') : t(sevenDay ? '7天可用性' : '平均首字')}
          </div>
          <div className='mt-1 text-sm font-semibold text-semi-color-text-0'>
            {noRequests
              ? t('近期无请求')
              : sevenDay
                ? `${successRate.toFixed(1)}%`
                : averageTTFT.text}
          </div>
        </div>
        <div className='rounded-lg bg-semi-color-fill-0 px-3 py-2'>
          <div className='text-[11px] text-semi-color-text-2'>
            {allFailed ? t('请求状态') : t('平均用时')}
          </div>
          <div className='mt-1 text-sm font-semibold text-semi-color-text-0'>
            {allFailed ? t('全部失败') : responseTime}
          </div>
        </div>
      </div>

      <div className='mt-2 min-h-8 space-y-1 text-[11px] leading-4 text-semi-color-text-2'>
        {!sevenDay && !noRequests && (
          <div>
            {t('错误率 {{error}} · 空回率 {{empty}}', {
              error: `${Number(model.error_rate || 0).toFixed(1)}%`,
              empty: `${Number(model.empty_rate || 0).toFixed(1)}%`,
            })}
          </div>
        )}
        {errors.length > 0 && (
          <div className='line-clamp-2' title={errors.join(' / ')}>
            {t('常见报错：{{errors}}', { errors: errors.join(' / ') })}
          </div>
        )}
      </div>
    </div>
  );
});

ModelCard.displayName = 'ModelCard';

const LoadingGrid = () => (
  <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
    {[0, 1, 2, 3].map((item) => (
      <Card key={item} className='!rounded-2xl' bodyStyle={{ padding: 16 }}>
        <Skeleton
          active
          placeholder={
            <div className='space-y-4'>
              <Skeleton.Title style={{ width: '55%' }} />
              <Skeleton.Paragraph rows={3} />
            </div>
          }
        />
      </Card>
    ))}
  </div>
);

const ChannelStatusDashboard = () => {
  const { t } = useTranslation();
  const [windowSeconds, setWindowSeconds] = useState(60);
  const { data, error, connectionStatus, lastHeartbeat } =
    useChannelStatusSocket(windowSeconds);
  const sections = useMemo(
    () => groupChannelStatusModels(data?.models || []),
    [data?.models],
  );
  const connection =
    CONNECTION_PRESENTATION[connectionStatus] ||
    CONNECTION_PRESENTATION.connecting;
  const updatedAt = lastHeartbeat
    ? new Date(lastHeartbeat).toLocaleTimeString([], { hour12: false })
    : '—';

  return (
    <div className='mx-auto mt-[60px] max-w-[1600px] px-2 pb-8'>
      <Card
        className='border-0 !rounded-2xl bg-semi-color-bg-0'
        bodyStyle={{ padding: 16 }}
      >
        <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex items-start gap-3'>
            <div className='flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-semi-color-primary-light-default text-semi-color-primary'>
              <Activity size={22} />
            </div>
            <div>
              <div className='text-xl font-bold text-semi-color-text-0'>
                {t('渠道请求状态')}
              </div>
              <div className='mt-1 flex flex-wrap items-center gap-2 text-xs text-semi-color-text-2'>
                <span>
                  {t('最近 {{window}} 全站真实流量', {
                    window: CHANNEL_STATUS_WINDOWS.find(
                      (item) => item.value === windowSeconds,
                    )?.label,
                  })}
                </span>
                <span>·</span>
                <span>{t('WebSocket 实时推送')}</span>
              </div>
            </div>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <div
              className='flex rounded-xl bg-semi-color-fill-0 p-1'
              role='group'
              aria-label={t('统计窗口')}
            >
              {CHANNEL_STATUS_WINDOWS.map((item) => (
                <Button
                  key={item.value}
                  size='small'
                  type={windowSeconds === item.value ? 'primary' : 'tertiary'}
                  theme={windowSeconds === item.value ? 'solid' : 'borderless'}
                  onClick={() => setWindowSeconds(item.value)}
                  aria-pressed={windowSeconds === item.value}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <Tag
              prefixIcon={<Radio size={12} />}
              color={connection.color}
              shape='circle'
            >
              {t(connection.label)} · {t('1 秒心跳')}
            </Tag>
            <Tag prefixIcon={<Clock3 size={12} />} color='white' shape='circle'>
              {updatedAt}
            </Tag>
          </div>
        </div>
      </Card>

      {error && (
        <Banner
          type='danger'
          className='mt-3 !rounded-xl'
          description={t('无法连接渠道请求状态服务')}
          closeIcon={null}
        />
      )}

      <div className='mt-3 grid grid-cols-1 gap-3 md:grid-cols-3'>
        <SummaryCard
          icon={<Zap size={18} />}
          label={t('最快首字')}
          metric={formatTTFT(data?.min_ttft_ms)}
          accent='var(--semi-color-success)'
        />
        <SummaryCard
          icon={<Gauge size={18} />}
          label={t('平均首字')}
          metric={formatTTFT(data?.overall_ttft_ms)}
          accent='var(--semi-color-primary)'
        />
        <SummaryCard
          icon={<Timer size={18} />}
          label={t('最慢首字')}
          metric={formatTTFT(data?.max_ttft_ms)}
          accent='var(--semi-color-warning)'
        />
      </div>

      <CodexChannelUsageSection />

      <div className='mb-3 mt-5 text-sm font-semibold text-semi-color-text-1'>
        {t('分组 / 模型状态')}
      </div>

      {!data ? (
        <LoadingGrid />
      ) : sections.length === 0 ? (
        <Card className='!rounded-2xl'>
          <Empty
            title={t('暂无最近流量')}
            description={t('窗口内没有匹配请求，有流量后会自动出现')}
          />
        </Card>
      ) : (
        <div className='space-y-3'>
          {sections.map((section) => (
            <Card
              key={section.section}
              className='border-0 !rounded-2xl bg-semi-color-bg-0'
              bodyStyle={{ padding: 16 }}
            >
              <div className='mb-4 flex flex-wrap items-baseline justify-between gap-2'>
                <div className='text-base font-bold text-semi-color-text-0'>
                  {section.section === 'available'
                    ? t('当前可用模型')
                    : section.section}
                </div>
                <div className='text-xs text-semi-color-text-2'>
                  {section.description}
                </div>
              </div>
              <div className='space-y-4'>
                {section.families.map((family) => (
                  <section key={family.family}>
                    <div className='mb-2 flex items-center gap-2 text-xs font-semibold text-semi-color-text-1'>
                      <span className='h-1.5 w-1.5 rounded-full bg-semi-color-primary' />
                      {family.family}
                    </div>
                    <div className='grid grid-cols-1 gap-4 p-1 sm:grid-cols-2 xl:grid-cols-4'>
                      {family.models.map((model) => (
                        <ModelCard
                          key={`${section.section}-${family.family}-${model.model}`}
                          model={model}
                          sevenDay={windowSeconds === 604800}
                          t={t}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className='mt-5 text-center text-xs text-semi-color-text-2'>
        {t('数据来源：全站真实请求日志 · 只读聚合，不影响主服务')}
      </div>
    </div>
  );
};

export default ChannelStatusDashboard;
