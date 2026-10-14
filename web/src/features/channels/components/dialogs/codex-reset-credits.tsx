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
import { Check, RefreshCw, RotateCcw, AlertTriangle } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import type { CodexResetCreditsResponse } from '../../oauth-api'
import { InfoField } from './codex-rate-limits'
import {
  type CodexResetCredit,
  getResetCreditStatusBadge,
  formatTimeLeftUntil,
  normalizeResetCreditStatus,
  formatIsoTimestamp,
  type CodexResetCreditsPayload,
  sortResetCredits,
} from './codex-usage-data'

function ResetCreditTimeField(props: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div className='min-w-0'>
      <div className='text-muted-foreground text-[11px] font-medium'>
        {props.label}
      </div>
      <div
        className={cn(
          'mt-1 text-xs leading-5 tabular-nums',
          props.emphasis ? 'font-semibold' : 'text-foreground'
        )}
      >
        {props.value}
      </div>
    </div>
  )
}

function ResetCreditItem(props: { credit: CodexResetCredit; index: number }) {
  const { t } = useTranslation()
  const statusBadge = getResetCreditStatusBadge(props.credit.status, t)
  const title =
    props.credit.title?.trim() || `${t('Reset Credit')} ${props.index + 1}`
  const expiresIn = formatTimeLeftUntil(props.credit.expires_at, t)
  const isAvailable =
    normalizeResetCreditStatus(props.credit.status) === 'available'

  return (
    <div className='bg-background rounded-lg border p-3'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='min-w-0 text-sm font-medium break-words'>
              {title}
            </div>
            <StatusBadge
              label={t(statusBadge.label)}
              variant={statusBadge.variant}
              copyable={false}
            />
          </div>
          {props.credit.description ? (
            <div className='text-muted-foreground mt-1 text-xs leading-5'>
              {props.credit.description}
            </div>
          ) : null}
          {props.credit.id ? (
            <div className='text-muted-foreground mt-1 font-mono text-[11px] break-all'>
              {props.credit.id}
            </div>
          ) : null}
        </div>
        <div className='shrink-0 text-right'>
          <div className='text-muted-foreground text-[11px] font-medium'>
            {t('Expires in')}
          </div>
          <div
            className={cn(
              'mt-1 text-sm font-semibold tabular-nums',
              isAvailable ? 'text-success' : 'text-muted-foreground'
            )}
          >
            {expiresIn}
          </div>
        </div>
      </div>
      <div className='mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3'>
        <ResetCreditTimeField
          label={t('Granted at')}
          value={formatIsoTimestamp(props.credit.granted_at)}
        />
        <ResetCreditTimeField
          label={t('Expires at')}
          value={formatIsoTimestamp(props.credit.expires_at)}
        />
        <ResetCreditTimeField
          label={t('Redeemed at')}
          value={formatIsoTimestamp(props.credit.redeemed_at)}
          emphasis={Boolean(props.credit.redeemed_at)}
        />
      </div>
    </div>
  )
}

export function ResetCreditsPanel(props: {
  payload: CodexResetCreditsPayload | null
  response: CodexResetCreditsResponse | null
  usageAvailableCount: string
  isLoading: boolean
  isResetting: boolean
  errorMessage: string
  resetErrorMessage: string
  resetSuccessMessage: string
  onRefresh: () => void
  onRequestReset: () => void
}) {
  const { t } = useTranslation()
  const credits = useMemo(
    () => sortResetCredits(props.payload?.credits ?? []),
    [props.payload?.credits]
  )
  const detailAvailableCount = props.payload?.available_count
  const availableCount = Number.isFinite(Number(detailAvailableCount))
    ? String(detailAvailableCount)
    : props.usageAvailableCount
  const totalEarnedCount = Number.isFinite(
    Number(props.payload?.total_earned_count)
  )
    ? String(props.payload?.total_earned_count)
    : '-'
  const canReset = Number(availableCount) > 0
  let creditsContent: ReactNode
  if (props.errorMessage) {
    creditsContent = (
      <div className='border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm'>
        {props.errorMessage}
      </div>
    )
  } else if (props.isLoading) {
    creditsContent = (
      <div className='flex flex-col gap-2'>
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-24 w-full' />
      </div>
    )
  } else if (credits.length > 0) {
    creditsContent = (
      <div className='flex flex-col gap-2'>
        {credits.map((credit, index) => (
          <ResetCreditItem
            key={
              credit.id ??
              credit.expires_at ??
              credit.granted_at ??
              credit.title ??
              credit.reset_type ??
              ''
            }
            credit={credit}
            index={index}
          />
        ))}
      </div>
    )
  } else {
    creditsContent = (
      <Empty className='min-h-32 border'>
        <EmptyHeader>
          <EmptyTitle>{t('No reset credits')}</EmptyTitle>
          <EmptyDescription>
            {t('Upstream did not return reset credit details.')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className='flex flex-col gap-3 p-3'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        <InfoField
          label={t('Available reset credits')}
          value={availableCount}
          mono
          copyable={false}
        />
        <InfoField
          label={t('Total earned')}
          value={totalEarnedCount}
          mono
          copyable={false}
        />
        <InfoField
          label='HTTP'
          value={String(props.response?.upstream_status ?? '-')}
          mono
          copyable={false}
        />
      </div>

      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='text-muted-foreground text-xs leading-5'>
          {t('Available credits are ordered by soonest expiration.')}
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={props.onRefresh}
          disabled={props.isLoading}
        >
          <RefreshCw data-icon='inline-start' />
          {t('Refresh details')}
        </Button>
      </div>

      <div className='bg-muted/30 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='min-w-0'>
          <div className='text-sm font-semibold'>{t('Reset usage window')}</div>
          <div className='text-muted-foreground mt-1 text-xs leading-5'>
            {t(
              'Use one available reset credit to refresh the current Codex usage windows.'
            )}
          </div>
        </div>
        <Button
          type='button'
          variant={canReset ? 'destructive' : 'outline'}
          size='sm'
          onClick={props.onRequestReset}
          disabled={!canReset || props.isLoading || props.isResetting}
          className='shrink-0'
        >
          <RotateCcw data-icon='inline-start' />
          {props.isResetting ? t('Resetting...') : t('Apply reset')}
        </Button>
      </div>

      {!canReset ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>{t('No reset credits available')}</AlertTitle>
          <AlertDescription>
            {t('The reset request stays disabled until a credit is available.')}
          </AlertDescription>
        </Alert>
      ) : null}

      {props.resetSuccessMessage ? (
        <Alert className='border-success/40 bg-success/10 text-success'>
          <Check />
          <AlertTitle>{t('Reset completed')}</AlertTitle>
          <AlertDescription>{props.resetSuccessMessage}</AlertDescription>
        </Alert>
      ) : null}

      {props.resetErrorMessage ? (
        <Alert variant='destructive'>
          <AlertTriangle />
          <AlertTitle>{t('Reset failed')}</AlertTitle>
          <AlertDescription>{props.resetErrorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {creditsContent}
    </div>
  )
}
