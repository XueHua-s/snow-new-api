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
import { KeyRound, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, type StatusBadgeProps } from '@/components/status-badge'
import { useCodexChannelUsage } from '../hooks/use-codex-channel-usage'
import type {
  CodexChannelUsage,
  CodexUsageGroup,
  CodexUsageWindow,
} from '../types'

function clampPercent(value: number | undefined): number {
  const percent = Number(value)
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0
}

function usageTone(percent: number): string {
  if (percent >= 95) {
    return '[&_[data-slot=progress-indicator]]:bg-destructive'
  }
  if (percent >= 80) {
    return '[&_[data-slot=progress-indicator]]:bg-warning'
  }
  return '[&_[data-slot=progress-indicator]]:bg-primary'
}

function usageColor(percent: number): string {
  if (percent >= 95) return 'bg-destructive'
  if (percent >= 80) return 'bg-warning'
  return 'bg-primary'
}

function formatDuration(
  seconds: number | undefined,
  t: (key: string) => string
) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return '-'
  const total = Math.floor(value)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainingSeconds = total % 60
  if (hours > 0) return `${hours}${t('h')} ${minutes}${t('m')}`
  if (minutes > 0) return `${minutes}${t('m')} ${remainingSeconds}${t('s')}`
  return `${remainingSeconds}${t('s')}`
}

function formatResetAt(seconds: number | undefined): string {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return '-'
  return dayjs(value * 1000).format('YYYY-MM-DD HH:mm:ss')
}

const PLAN_BADGES: Record<
  string,
  { label: string; variant: StatusBadgeProps['variant'] }
> = {
  enterprise: { label: 'Enterprise', variant: 'success' },
  team: { label: 'Team', variant: 'info' },
  pro: { label: 'Pro', variant: 'blue' },
  plus: { label: 'Plus', variant: 'purple' },
  free: { label: 'Free', variant: 'warning' },
}

function getPlanBadge(
  planType: string | undefined,
  unknownLabel: string
): {
  label: string
  variant: StatusBadgeProps['variant']
} {
  const normalized = planType?.trim().toLowerCase() || ''
  return (
    PLAN_BADGES[normalized] ?? {
      label: planType?.trim() || unknownLabel,
      variant: 'neutral',
    }
  )
}

function UsageSummary(props: { label: string; window?: CodexUsageWindow }) {
  const percent = clampPercent(props.window?.used_percent)
  return (
    <div className='bg-muted/60 flex min-w-28 items-center gap-2 rounded-lg px-2.5 py-1.5'>
      <span className='text-muted-foreground text-[11px] whitespace-nowrap'>
        {props.label}
      </span>
      <div className='bg-muted h-1.5 min-w-8 flex-1 overflow-hidden rounded-full'>
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            usageColor(percent)
          )}
          style={{ width: props.window ? `${percent}%` : '0%' }}
        />
      </div>
      <span className='min-w-7 text-right text-xs font-semibold tabular-nums'>
        {props.window ? `${percent}%` : '—'}
      </span>
    </div>
  )
}

function UsageWindowCard(props: { title: string; window?: CodexUsageWindow }) {
  const { t } = useTranslation()
  const percent = clampPercent(props.window?.used_percent)
  return (
    <div className='rounded-xl border p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='text-sm font-semibold'>{props.title}</div>
          <div className='text-muted-foreground mt-1 text-[11px]'>
            {t('Reset at:')} {formatResetAt(props.window?.reset_at)}
          </div>
        </div>
        <span className='text-sm font-bold tabular-nums'>
          {props.window ? `${percent}%` : '—'}
        </span>
      </div>
      <Progress
        value={props.window ? percent : 0}
        className={cn('mt-3', usageTone(percent))}
        aria-label={`${props.title} ${props.window ? `${percent}%` : '-'}`}
      />
      <div className='text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs'>
        <span>
          {t('Resets in:')}{' '}
          {formatDuration(props.window?.reset_after_seconds, t)}
        </span>
        <span>
          {t('Window:')} {formatDuration(props.window?.limit_window_seconds, t)}
        </span>
      </div>
    </div>
  )
}

function UsageWindowGrid(props: { group: CodexUsageGroup }) {
  const { t } = useTranslation()
  return (
    <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
      <UsageWindowCard
        title={t('5-Hour Window')}
        window={props.group.five_hour_window}
      />
      <UsageWindowCard
        title={t('Weekly Window')}
        window={props.group.weekly_window}
      />
    </div>
  )
}

function ChannelSummary(props: { channel: CodexChannelUsage }) {
  const { t } = useTranslation()
  const plan = getPlanBadge(props.channel.plan_type, t('Unknown'))
  let statusLabel = t('Pending')
  let statusVariant: StatusBadgeProps['variant'] = 'neutral'
  if (props.channel.error) {
    statusLabel = t('Temporarily unavailable')
    statusVariant = 'danger'
  } else if (props.channel.available === true) {
    statusLabel = t('Available')
    statusVariant = 'success'
  } else if (props.channel.available === false) {
    statusLabel = t('Limited')
    statusVariant = 'danger'
  }

  return (
    <div className='flex min-w-0 flex-1 flex-col gap-2 py-1 pr-2 xl:flex-row xl:items-center xl:justify-between'>
      <div className='min-w-0'>
        <div className='truncate text-sm font-semibold'>
          {props.channel.name}
        </div>
        <div className='mt-2 flex flex-wrap items-center gap-3'>
          <StatusBadge
            label={plan.label}
            variant={plan.variant}
            size='lg'
            copyable={false}
          />
          <StatusBadge
            label={statusLabel}
            variant={statusVariant}
            copyable={false}
          />
          <StatusBadge
            label={`${t('Upstream status:')} ${props.channel.upstream_status || '-'}`}
            variant='neutral'
            copyable={false}
          />
        </div>
      </div>
      <div className='flex flex-wrap gap-2'>
        <UsageSummary
          label={t('5 hours')}
          window={props.channel.base_limit.five_hour_window}
        />
        <UsageSummary
          label={t('Weekly')}
          window={props.channel.base_limit.weekly_window}
        />
      </div>
    </div>
  )
}

function ChannelDetails(props: { channel: CodexChannelUsage }) {
  const { t } = useTranslation()
  return (
    <div className='space-y-5 px-1 pt-1 pb-2'>
      {props.channel.error && (
        <Alert>
          <AlertDescription>
            {t('OAuth usage for this channel is temporarily unavailable.')}
          </AlertDescription>
        </Alert>
      )}
      <section className='space-y-3'>
        <div>
          <h3 className='text-sm font-semibold'>{t('Base Limits')}</h3>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t('Base rate limit windows for this account.')}
          </p>
        </div>
        <UsageWindowGrid group={props.channel.base_limit} />
      </section>

      {props.channel.additional_limits.length > 0 && (
        <section className='space-y-4 border-t pt-4'>
          <div>
            <h3 className='text-sm font-semibold'>{t('Additional Limits')}</h3>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('Per-feature metered windows split by model or capability.')}
            </p>
          </div>
          {props.channel.additional_limits.map((group, index) => (
            <div
              key={`${group.name}-${group.metered_feature}-${index}`}
              className={index > 0 ? 'border-t pt-4' : undefined}
            >
              <div className='mb-3 flex flex-wrap items-center gap-2'>
                <span className='text-sm font-semibold'>
                  {group.name ||
                    group.metered_feature ||
                    `${t('Additional Limits')} ${index + 1}`}
                </span>
                {group.metered_feature && (
                  <span className='bg-muted rounded-full px-2 py-1 font-mono text-[11px]'>
                    {group.metered_feature}
                  </span>
                )}
              </div>
              <UsageWindowGrid group={group} />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function UsageLoading() {
  return (
    <div className='space-y-2 p-4'>
      {[0, 1].map((item) => (
        <div key={item} className='space-y-3 rounded-xl border p-4'>
          <Skeleton className='h-5 w-1/3' />
          <Skeleton className='h-8 w-full' />
        </div>
      ))}
    </div>
  )
}

export function CodexChannelUsageSection() {
  const { t } = useTranslation()
  const query = useCodexChannelUsage()
  const channels = query.data?.channels ?? []
  const updatedAt = query.data?.updated_at
    ? dayjs(query.data.updated_at * 1000).format('HH:mm:ss')
    : '—'

  return (
    <section aria-labelledby='codex-channel-usage-title'>
      <Card className='gap-0 overflow-hidden py-0'>
        <CardHeader className='flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-start gap-3'>
            <div className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl'>
              <KeyRound className='size-4.5' />
            </div>
            <div>
              <h2 id='codex-channel-usage-title' className='font-bold'>
                {t('Codex channel usage')}
              </h2>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t(
                  'OAuth channels only. Expand a channel to view base and additional usage windows.'
                )}
              </p>
            </div>
          </div>
          <div className='flex items-center gap-2 self-end sm:self-auto'>
            <span className='text-muted-foreground text-xs tabular-nums'>
              {t('Updated at')} {updatedAt}
            </span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => query.refresh().catch(() => {})}
              disabled={query.isFetching}
            >
              <RefreshCw
                className={cn('size-3.5', query.isFetching && 'animate-spin')}
              />
              {t('Refresh')}
            </Button>
          </div>
        </CardHeader>

        {query.isLoading ? (
          <UsageLoading />
        ) : query.isError ? (
          <CardContent className='p-4'>
            <Alert variant='destructive'>
              <AlertDescription>
                {t('Unable to load Codex OAuth channel usage.')}
              </AlertDescription>
            </Alert>
          </CardContent>
        ) : channels.length === 0 ? (
          <CardContent className='p-5'>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <KeyRound />
                </EmptyMedia>
                <EmptyTitle>{t('No Codex OAuth channels')}</EmptyTitle>
                <EmptyDescription>
                  {t('API key and quota-based channels are not shown here.')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        ) : (
          <Accordion className='px-4'>
            {channels.map((channel, index) => (
              <AccordionItem
                key={`${channel.name}-${index}`}
                value={`codex-channel-${index}`}
              >
                <AccordionTrigger className='py-3 hover:no-underline'>
                  <ChannelSummary channel={channel} />
                </AccordionTrigger>
                <AccordionContent className='pb-4'>
                  <ChannelDetails channel={channel} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </Card>
    </section>
  )
}
