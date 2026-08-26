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
import { Activity, Clock3, Gauge, Radio, Timer, Zap } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { CodexChannelUsageSection } from './components/codex-channel-usage-section'
import { ModelStatusCard } from './components/model-status-card'
import { useChannelStatusSocket } from './hooks/use-channel-status-socket'
import { CHANNEL_STATUS_WINDOWS, formatTTFT, groupModels } from './lib'
import type { ChannelStatusConnection } from './types'

const CONNECTION_STYLES: Record<ChannelStatusConnection, string> = {
  connected:
    'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  connecting: 'border-primary/20 bg-primary/10 text-primary',
  reconnecting:
    'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
}

type SummaryCardProps = {
  icon: ReactNode
  label: string
  metric: ReturnType<typeof formatTTFT>
  accent: string
}

function SummaryCard(props: SummaryCardProps) {
  return (
    <Card className='gap-0 py-0'>
      <CardContent className='flex items-start justify-between gap-3 p-4'>
        <div>
          <div className='text-muted-foreground text-xs font-medium'>
            {props.label}
          </div>
          <div className='mt-2 flex items-baseline gap-1'>
            <span className='text-2xl font-bold tracking-tight tabular-nums'>
              {props.metric.value}
            </span>
            <span className='text-muted-foreground text-xs font-medium'>
              {props.metric.unit}
            </span>
          </div>
        </div>
        <div
          className={cn(
            'flex size-9 items-center justify-center rounded-xl',
            props.accent
          )}
        >
          {props.icon}
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingGrid() {
  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
      {[0, 1, 2, 3].map((item) => (
        <Card key={item} className='gap-3 p-4'>
          <Skeleton className='h-5 w-2/3' />
          <Skeleton className='h-1 w-full' />
          <div className='grid grid-cols-2 gap-2'>
            <Skeleton className='h-14' />
            <Skeleton className='h-14' />
          </div>
        </Card>
      ))}
    </div>
  )
}

export function ChannelStatus() {
  const { t } = useTranslation()
  const [windowSeconds, setWindowSeconds] = useState(60)
  const { data, error, connection, lastHeartbeat } =
    useChannelStatusSocket(windowSeconds)
  const sections = useMemo(() => groupModels(data?.models), [data?.models])
  const selectedWindow = CHANNEL_STATUS_WINDOWS.find(
    (item) => item.value === windowSeconds
  )
  const updatedAt = lastHeartbeat
    ? new Date(lastHeartbeat).toLocaleTimeString([], { hour12: false })
    : '—'

  const connectionLabel: Record<ChannelStatusConnection, string> = {
    connected: t('Connected'),
    connecting: t('Connecting'),
    reconnecting: t('Reconnecting'),
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Channel request status')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto max-w-[1600px] space-y-3 pb-3'>
          <Card className='gap-0 py-0'>
            <CardContent className='flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between'>
              <div className='flex items-start gap-3'>
                <div className='bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl'>
                  <Activity className='size-5' />
                </div>
                <div>
                  <h1 className='text-xl font-bold'>
                    {t('Channel request status')}
                  </h1>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {t('Real traffic in the last {{window}}', {
                      window: selectedWindow?.label ?? '60s',
                    })}{' '}
                    · {t('Live WebSocket updates')}
                  </p>
                </div>
              </div>

              <div className='flex flex-wrap items-center gap-2'>
                <div
                  className='bg-muted flex rounded-xl p-1'
                  role='group'
                  aria-label={t('Statistics window')}
                >
                  {CHANNEL_STATUS_WINDOWS.map((item) => (
                    <Button
                      key={item.value}
                      size='sm'
                      variant={
                        windowSeconds === item.value ? 'default' : 'ghost'
                      }
                      className='h-7 px-2.5 text-xs'
                      onClick={() => setWindowSeconds(item.value)}
                      aria-pressed={windowSeconds === item.value}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
                <Badge
                  variant='outline'
                  className={cn('h-7 gap-1.5', CONNECTION_STYLES[connection])}
                >
                  <Radio
                    className={cn(
                      'size-3',
                      connection === 'connected' && 'animate-pulse'
                    )}
                  />
                  {connectionLabel[connection]} · {t('1 second heartbeat')}
                </Badge>
                <Badge variant='outline' className='h-7 gap-1.5 tabular-nums'>
                  <Clock3 className='size-3' />
                  {updatedAt}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {error && (
            <Alert variant='destructive'>
              <Radio />
              <AlertTitle>{t('Channel request status unavailable')}</AlertTitle>
              <AlertDescription>
                {t('The WebSocket will reconnect automatically')}
              </AlertDescription>
            </Alert>
          )}

          <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
            <SummaryCard
              icon={<Zap className='size-4' />}
              label={t('Fastest TTFT')}
              metric={formatTTFT(data?.min_ttft_ms)}
              accent='bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
            />
            <SummaryCard
              icon={<Gauge className='size-4' />}
              label={t('Average TTFT')}
              metric={formatTTFT(data?.overall_ttft_ms)}
              accent='bg-primary/10 text-primary'
            />
            <SummaryCard
              icon={<Timer className='size-4' />}
              label={t('Slowest TTFT')}
              metric={formatTTFT(data?.max_ttft_ms)}
              accent='bg-amber-500/10 text-amber-600 dark:text-amber-300'
            />
          </div>

          <CodexChannelUsageSection />

          <div className='text-muted-foreground pt-2 text-sm font-semibold'>
            {t('Group and model status')}
          </div>

          {!data && <LoadingGrid />}

          {data && sections.length === 0 && (
            <Card>
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <Activity />
                  </EmptyMedia>
                  <EmptyTitle>{t('No recent traffic')}</EmptyTitle>
                  <EmptyDescription>
                    {t(
                      'Models appear automatically when matching traffic arrives'
                    )}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </Card>
          )}

          {sections.map((section) => (
            <Card key={section.section} className='gap-0 py-0'>
              <CardHeader className='border-b py-4'>
                <CardTitle className='flex flex-wrap items-baseline justify-between gap-2'>
                  <span>
                    {section.section === 'available'
                      ? t('Available models')
                      : section.section}
                  </span>
                  <span className='text-muted-foreground text-xs font-normal'>
                    {section.description && `${section.description} · `}
                    {t('{{count}} models', { count: section.modelCount })}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4 p-4'>
                {section.families.map((family) => (
                  <section key={family.family}>
                    <div className='text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold'>
                      <span className='bg-primary size-1.5 rounded-full' />
                      {family.family}
                    </div>
                    <div className='grid grid-cols-1 gap-4 p-1 sm:grid-cols-2 xl:grid-cols-4'>
                      {family.models.map((model) => (
                        <ModelStatusCard
                          key={`${section.section}-${family.family}-${model.model}`}
                          model={model}
                          sevenDay={windowSeconds === 604800}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </CardContent>
            </Card>
          ))}

          <p className='text-muted-foreground pt-2 text-center text-xs'>
            {t('Source: real request logs · read-only aggregation')}
          </p>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
