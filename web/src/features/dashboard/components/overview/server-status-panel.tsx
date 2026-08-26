/*
Copyright (C) 2023-2026 QuantumNous

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
import {
  Box,
  Cpu,
  Database,
  MemoryStick,
  Network,
  Radio,
  Server,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useServerTelemetry } from '@/features/dashboard/hooks/use-server-telemetry'
import {
  formatTelemetryBytes,
  formatTelemetryRate,
  formatTelemetryUptime,
  getNewApiNetwork,
  getRaidStoragePool,
  summarizeCpuArchitectures,
  type ServerTelemetryConnection,
  type TelemetryHealth,
} from '@/features/dashboard/server-telemetry'
import { cn } from '@/lib/utils'

import { PanelWrapper } from '../ui/panel-wrapper'

const CONNECTION_STYLES: Record<ServerTelemetryConnection, string> = {
  connecting: 'border-primary/20 bg-primary/10 text-primary',
  online:
    'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  reconnecting:
    'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
}

const HEALTH_STYLES: Record<TelemetryHealth, string> = {
  healthy:
    'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  degraded:
    'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  offline: 'border-destructive/20 bg-destructive/10 text-destructive',
}

type StatusBlockProps = {
  icon: ReactNode
  title: string
  className?: string
  children: ReactNode
}

function StatusBlock(props: StatusBlockProps) {
  return (
    <section
      className={cn(
        'border-border bg-card rounded-xl border p-3',
        props.className
      )}
    >
      <div className='text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold'>
        {props.icon}
        {props.title}
      </div>
      {props.children}
    </section>
  )
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className='bg-muted/60 rounded-lg px-2.5 py-2'>
      <div className='text-muted-foreground text-[11px]'>{props.label}</div>
      <div className='mt-1 truncate text-sm font-semibold' title={props.value}>
        {props.value}
      </div>
    </div>
  )
}

function connectionLabel(
  connection: ServerTelemetryConnection,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (connection === 'online') return t('Online')
  if (connection === 'reconnecting') return t('Reconnecting')
  return t('Connecting')
}

function healthLabel(
  health: TelemetryHealth,
  t: ReturnType<typeof useTranslation>['t']
): string {
  if (health === 'healthy') return t('Healthy')
  if (health === 'degraded') return t('Needs attention')
  return t('Offline')
}

export function ServerStatusPanel() {
  const { t } = useTranslation()
  const { snapshot, connection } = useServerTelemetry()
  const network = snapshot ? getNewApiNetwork(snapshot) : null
  const raid = snapshot ? getRaidStoragePool(snapshot) : null
  const generatedTime = snapshot
    ? new Date(snapshot.generatedAtEpochSeconds * 1000).toLocaleTimeString([], {
        hour12: false,
      })
    : '—'

  return (
    <PanelWrapper
      title={
        <span className='flex items-center gap-2'>
          <Server className='text-muted-foreground/60 size-4' />
          {t('Server status')}
        </span>
      }
      description={t('Live system telemetry')}
      loading={!snapshot && connection === 'connecting'}
      empty={!snapshot && connection !== 'connecting'}
      emptyMessage={t('No server telemetry available')}
      height='h-[34rem]'
      contentClassName='p-0'
      headerActions={
        <Badge
          variant='outline'
          className={cn('h-6 gap-1.5', CONNECTION_STYLES[connection])}
        >
          <Radio
            className={cn('size-3', connection === 'online' && 'animate-pulse')}
          />
          {connectionLabel(connection, t)} · {generatedTime}
        </Badge>
      }
    >
      {snapshot && (
        <ScrollArea className='h-[34rem]'>
          <div className='grid grid-cols-1 gap-3 p-3 sm:grid-cols-2'>
            <StatusBlock
              icon={<Cpu className='size-3.5' />}
              title={t('Processor')}
              className='sm:col-span-2'
            >
              <div className='flex flex-wrap items-end justify-between gap-2'>
                <div>
                  <div className='text-2xl font-bold tabular-nums'>
                    {snapshot.cpu.usagePercent.toFixed(1)}%
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    {snapshot.cpu.cores.length} {t('cores')} ·{' '}
                    {summarizeCpuArchitectures(snapshot.cpu.cores)}
                  </div>
                </div>
                <div className='text-muted-foreground text-xs'>
                  {snapshot.cpu.temperatureCelsius === null
                    ? t('Temperature unavailable')
                    : `${snapshot.cpu.temperatureCelsius.toFixed(1)} °C`}
                </div>
              </div>
              <Progress
                value={snapshot.cpu.usagePercent}
                className='mt-2'
                aria-label={t('Total CPU usage')}
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

            <StatusBlock
              icon={<MemoryStick className='size-3.5' />}
              title={t('Memory usage')}
            >
              <div className='text-xl font-bold tabular-nums'>
                {snapshot.memory.usagePercent.toFixed(1)}%
              </div>
              <div className='text-muted-foreground mt-1 text-xs'>
                {formatTelemetryBytes(snapshot.memory.usedBytes)} /{' '}
                {formatTelemetryBytes(snapshot.memory.totalBytes)}
              </div>
              <Progress value={snapshot.memory.usagePercent} className='mt-2' />
            </StatusBlock>

            <StatusBlock
              icon={<Box className='size-3.5' />}
              title={t('System information')}
            >
              <div className='text-sm font-semibold'>
                {snapshot.system.boardModel}
              </div>
              <div className='mt-2 grid grid-cols-2 gap-2'>
                <Metric
                  label={t('Architecture')}
                  value={snapshot.system.architecture}
                />
                <Metric
                  label={t('Uptime')}
                  value={formatTelemetryUptime(snapshot.system.uptimeSeconds)}
                />
              </div>
            </StatusBlock>

            <StatusBlock
              icon={<Server className='size-3.5' />}
              title={t('Docker container status')}
              className='sm:col-span-2'
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='text-sm font-semibold'>
                  Docker Engine ·{' '}
                  {snapshot.docker.version || t('Version unavailable')}
                </div>
                <Badge
                  variant='outline'
                  className={HEALTH_STYLES[snapshot.docker.health]}
                >
                  {healthLabel(snapshot.docker.health, t)}
                </Badge>
              </div>
              <div className='mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4'>
                <Metric
                  label={t('Running')}
                  value={`${snapshot.docker.runningContainers} / ${snapshot.docker.totalContainers}`}
                />
                <Metric
                  label={t('Healthy')}
                  value={String(snapshot.docker.healthyContainers)}
                />
                <Metric
                  label={t('Starting')}
                  value={String(snapshot.docker.startingContainers)}
                />
                <Metric
                  label={t('Unhealthy')}
                  value={String(snapshot.docker.unhealthyContainers)}
                />
              </div>
            </StatusBlock>

            {raid && (
              <StatusBlock
                icon={<Database className='size-3.5' />}
                title={`${raid.label} · ${raid.level}`}
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-lg font-bold tabular-nums'>
                    {raid.usagePercent.toFixed(1)}%
                  </span>
                  <Badge
                    variant='outline'
                    className={HEALTH_STYLES[raid.health]}
                  >
                    {healthLabel(raid.health, t)}
                  </Badge>
                </div>
                <Progress
                  value={raid.usagePercent}
                  className='mt-2 [&_[data-slot=progress-indicator]]:bg-emerald-500'
                />
                <div className='mt-2 grid grid-cols-2 gap-2'>
                  <Metric
                    label={t('RAID members')}
                    value={`${raid.activeMembers} / ${raid.totalMembers}`}
                  />
                  <Metric
                    label={t('Capacity')}
                    value={`${formatTelemetryBytes(raid.usedBytes)} / ${formatTelemetryBytes(raid.capacityBytes)}`}
                  />
                </div>
              </StatusBlock>
            )}

            {network && (
              <StatusBlock
                icon={<Network className='size-3.5' />}
                title={network.label}
              >
                <div className='grid grid-cols-2 gap-2'>
                  <Metric
                    label={t('Live download')}
                    value={`↓ ${formatTelemetryRate(network.receivedBytesPerSecond)}`}
                  />
                  <Metric
                    label={t('Live upload')}
                    value={`↑ ${formatTelemetryRate(network.sentBytesPerSecond)}`}
                  />
                  <Metric
                    label={t('Total download')}
                    value={`↓ ${formatTelemetryBytes(network.receivedBytes)}`}
                  />
                  <Metric
                    label={t('Total upload')}
                    value={`↑ ${formatTelemetryBytes(network.sentBytes)}`}
                  />
                </div>
              </StatusBlock>
            )}
          </div>
        </ScrollArea>
      )}
    </PanelWrapper>
  )
}
