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

import React from 'react';
import { Card, Empty, Progress, Skeleton, Tag } from '@douyinfe/semi-ui';
import {
  Box,
  Cpu,
  Database,
  MemoryStick,
  Network,
  Radio,
  Server,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  IllustrationConstruction,
  IllustrationConstructionDark,
} from '@douyinfe/semi-illustrations';
import { useServerTelemetry } from '../../hooks/dashboard/useServerTelemetry';
import {
  formatTelemetryBytes,
  formatTelemetryRate,
  formatTelemetryUptime,
  getNewApiNetwork,
  getRaidStoragePool,
  summarizeCpuArchitectures,
} from '../../helpers/server-telemetry';
import ScrollableContainer from '../common/ui/ScrollableContainer';

const CONNECTION_LABELS = {
  connecting: '连接中',
  online: '在线',
  reconnecting: '正在重连',
};

const HEALTH_COLORS = {
  healthy: 'green',
  degraded: 'orange',
  offline: 'red',
};

const StatusBlock = ({ icon, title, className = '', children }) => (
  <section
    className={`rounded-xl border border-semi-color-border bg-semi-color-bg-0 p-3 ${className}`}
  >
    <div className='mb-2 flex items-center gap-2 text-xs font-semibold text-semi-color-text-1'>
      {icon}
      {title}
    </div>
    {children}
  </section>
);

const Metric = ({ label, value }) => (
  <div className='rounded-lg bg-semi-color-fill-0 px-2.5 py-2'>
    <div className='text-[11px] text-semi-color-text-2'>{label}</div>
    <div
      className='mt-1 truncate text-sm font-semibold text-semi-color-text-0'
      title={value}
    >
      {value}
    </div>
  </div>
);

const ServerStatusPanel = ({ CARD_PROPS, ILLUSTRATION_SIZE }) => {
  const { t } = useTranslation();
  const { snapshot, connectionState } = useServerTelemetry();
  const network = snapshot ? getNewApiNetwork(snapshot) : null;
  const raid = snapshot ? getRaidStoragePool(snapshot) : null;
  const generatedTime = snapshot
    ? new Date(snapshot.generatedAtEpochSeconds * 1000).toLocaleTimeString([], {
        hour12: false,
      })
    : '—';

  return (
    <Card
      {...CARD_PROPS}
      className='shadow-sm !rounded-2xl lg:col-span-2'
      title={
        <div className='flex w-full flex-wrap items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Server size={16} />
            {t('服务器状态')}
            <Tag color='white' shape='circle'>
              {t('实时系统遥测')}
            </Tag>
          </div>
          <Tag
            prefixIcon={<Radio size={12} />}
            color={connectionState === 'online' ? 'green' : 'orange'}
            shape='circle'
          >
            {t(CONNECTION_LABELS[connectionState])} · {generatedTime}
          </Tag>
        </div>
      }
      bodyStyle={{ padding: 0 }}
    >
      <ScrollableContainer maxHeight='24rem'>
        {!snapshot ? (
          connectionState === 'connecting' ? (
            <div className='grid grid-cols-1 gap-3 p-3 sm:grid-cols-2'>
              {[0, 1, 2, 3].map((item) => (
                <Skeleton
                  key={item}
                  active
                  placeholder={
                    <div className='rounded-xl border border-semi-color-border p-3'>
                      <Skeleton.Title style={{ width: '45%' }} />
                      <Skeleton.Paragraph rows={2} />
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            <div className='flex items-center justify-center py-8'>
              <Empty
                image={<IllustrationConstruction style={ILLUSTRATION_SIZE} />}
                darkModeImage={
                  <IllustrationConstructionDark style={ILLUSTRATION_SIZE} />
                }
                title={t('暂无服务器状态')}
                description={t('正在重新连接实时遥测服务')}
              />
            </div>
          )
        ) : (
          <div className='grid grid-cols-1 gap-3 p-3 sm:grid-cols-2'>
            <StatusBlock
              icon={<Cpu size={14} />}
              title={t('处理器')}
              className='sm:col-span-2'
            >
              <div className='flex flex-wrap items-end justify-between gap-2'>
                <div>
                  <div className='text-2xl font-bold tabular-nums text-semi-color-text-0'>
                    {snapshot.cpu.usagePercent.toFixed(1)}%
                  </div>
                  <div className='text-xs text-semi-color-text-2'>
                    {snapshot.cpu.cores.length} {t('核心')} ·{' '}
                    {summarizeCpuArchitectures(snapshot.cpu.cores)}
                  </div>
                </div>
                <div className='text-xs text-semi-color-text-2'>
                  {snapshot.cpu.temperatureCelsius === null
                    ? t('温度不可用')
                    : `${snapshot.cpu.temperatureCelsius.toFixed(1)} °C`}
                </div>
              </div>
              <Progress
                className='mt-2'
                percent={snapshot.cpu.usagePercent}
                showInfo={false}
                stroke='var(--semi-color-primary)'
                aria-label={t('CPU 总使用率')}
              />
              <div className='mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6'>
                {snapshot.cpu.cores.map((core) => (
                  <Metric
                    key={core.id}
                    label={`CPU${core.id}`}
                    value={`${core.usagePercent.toFixed(0)}%`}
                  />
                ))}
              </div>
            </StatusBlock>

            <StatusBlock icon={<MemoryStick size={14} />} title={t('内存使用')}>
              <div className='text-xl font-bold tabular-nums text-semi-color-text-0'>
                {snapshot.memory.usagePercent.toFixed(1)}%
              </div>
              <div className='mt-1 text-xs text-semi-color-text-2'>
                {formatTelemetryBytes(snapshot.memory.usedBytes)} /{' '}
                {formatTelemetryBytes(snapshot.memory.totalBytes)}
              </div>
              <Progress
                className='mt-2'
                percent={snapshot.memory.usagePercent}
                showInfo={false}
                stroke='var(--semi-color-primary)'
              />
            </StatusBlock>

            <StatusBlock icon={<Box size={14} />} title={t('系统信息')}>
              <div className='text-sm font-semibold text-semi-color-text-0'>
                {snapshot.system.boardModel}
              </div>
              <div className='mt-2 grid grid-cols-2 gap-2'>
                <Metric
                  label={t('架构')}
                  value={snapshot.system.architecture}
                />
                <Metric
                  label={t('运行时间')}
                  value={formatTelemetryUptime(snapshot.system.uptimeSeconds)}
                />
              </div>
            </StatusBlock>

            <StatusBlock
              icon={<Server size={14} />}
              title={t('Docker · 容器运行状态')}
              className='sm:col-span-2'
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='text-sm font-semibold text-semi-color-text-0'>
                  Docker Engine · {snapshot.docker.version || t('版本不可用')}
                </div>
                <Tag
                  color={HEALTH_COLORS[snapshot.docker.health] || 'grey'}
                  shape='circle'
                >
                  {t(
                    snapshot.docker.health === 'healthy'
                      ? '引擎正常'
                      : '需要检查',
                  )}
                </Tag>
              </div>
              <div className='mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4'>
                <Metric
                  label={t('运行中')}
                  value={`${snapshot.docker.runningContainers} / ${snapshot.docker.totalContainers}`}
                />
                <Metric
                  label={t('健康')}
                  value={String(snapshot.docker.healthyContainers)}
                />
                <Metric
                  label={t('启动中')}
                  value={String(snapshot.docker.startingContainers)}
                />
                <Metric
                  label={t('异常')}
                  value={String(snapshot.docker.unhealthyContainers)}
                />
              </div>
            </StatusBlock>

            {raid && (
              <StatusBlock
                icon={<Database size={14} />}
                title={`${raid.label} · ${raid.level}`}
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-lg font-bold tabular-nums text-semi-color-text-0'>
                    {raid.usagePercent.toFixed(1)}%
                  </span>
                  <Tag
                    color={HEALTH_COLORS[raid.health] || 'grey'}
                    shape='circle'
                  >
                    {t(raid.health === 'healthy' ? '阵列正常' : '阵列异常')}
                  </Tag>
                </div>
                <Progress
                  className='mt-2'
                  percent={raid.usagePercent}
                  showInfo={false}
                  stroke='var(--semi-color-success)'
                />
                <div className='mt-2 grid grid-cols-2 gap-2'>
                  <Metric
                    label={t('阵列成员')}
                    value={`${raid.activeMembers} / ${raid.totalMembers}`}
                  />
                  <Metric
                    label={t('容量')}
                    value={`${formatTelemetryBytes(raid.usedBytes)} / ${formatTelemetryBytes(raid.capacityBytes)}`}
                  />
                </div>
              </StatusBlock>
            )}

            {network && (
              <StatusBlock icon={<Network size={14} />} title={network.label}>
                <div className='grid grid-cols-2 gap-2'>
                  <Metric
                    label={t('实时下载')}
                    value={`↓ ${formatTelemetryRate(network.receivedBytesPerSecond)}`}
                  />
                  <Metric
                    label={t('实时上传')}
                    value={`↑ ${formatTelemetryRate(network.sentBytesPerSecond)}`}
                  />
                  <Metric
                    label={t('累计下载')}
                    value={`↓ ${formatTelemetryBytes(network.receivedBytes)}`}
                  />
                  <Metric
                    label={t('累计上传')}
                    value={`↑ ${formatTelemetryBytes(network.sentBytes)}`}
                  />
                </div>
              </StatusBlock>
            )}
          </div>
        )}
      </ScrollableContainer>
    </Card>
  );
};

export default ServerStatusPanel;
