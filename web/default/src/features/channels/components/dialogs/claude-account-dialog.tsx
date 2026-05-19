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
import { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/status-badge'
import type { ClaudeUsageResponse } from '../../api'

type ClaudeAccountPayload = {
  loggedIn?: boolean
  authMethod?: string
  apiProvider?: string
  email?: string
  orgId?: string
  orgName?: string
  subscriptionType?: string
  rateLimitTier?: string
  expiresAt?: string
  lastRefresh?: string
  directOAuth?: boolean
  usageAvailable?: boolean
  usageMessage?: string
}

type ClaudeAccountDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  channelName?: string
  channelId?: number
  response: ClaudeUsageResponse | null
  onRefresh?: () => void
  isRefreshing?: boolean
}

function Field(props: { label: string; value?: unknown; mono?: boolean }) {
  const value =
    props.value === null || props.value === undefined || props.value === ''
      ? '-'
      : String(props.value)

  return (
    <div className='grid gap-1 border-b py-2 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:gap-3'>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div
        className={
          props.mono
            ? 'font-mono text-xs break-all'
            : 'text-sm break-words'
        }
      >
        {value}
      </div>
    </div>
  )
}

export function ClaudeAccountDialog({
  open,
  onOpenChange,
  channelName,
  channelId,
  response,
  onRefresh,
  isRefreshing,
}: ClaudeAccountDialogProps) {
  const { t } = useTranslation()
  const payload = useMemo(() => {
    const raw = response?.data
    if (!raw || typeof raw !== 'object') return null
    const nested = (raw as { data?: unknown }).data
    if (nested && typeof nested === 'object') {
      return nested as ClaudeAccountPayload
    }
    return raw as ClaudeAccountPayload
  }, [response?.data])

  const errorMessage =
    response?.success === false
      ? response?.message?.trim() || t('Failed to fetch usage')
      : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Claude Account & Subscription')}</DialogTitle>
          <DialogDescription>
            {t('Channel:')} <strong>{channelName || '-'}</strong>{' '}
            {channelId ? `(#${channelId})` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          {errorMessage && (
            <div className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'>
              {errorMessage}
            </div>
          )}

          <div className='rounded-lg border p-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <StatusBadge
                  label={payload?.loggedIn ? t('Logged in') : t('Unavailable')}
                  variant={payload?.loggedIn ? 'success' : 'neutral'}
                  copyable={false}
                />
                <StatusBadge
                  label={payload?.subscriptionType || t('Unknown')}
                  variant='neutral'
                  copyable={false}
                />
                {typeof response?.upstream_status === 'number' && (
                  <StatusBadge
                    label={`${t('Status:')} ${response.upstream_status}`}
                    variant='neutral'
                    copyable={false}
                  />
                )}
              </div>
              {onRefresh && (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={onRefresh}
                  disabled={Boolean(isRefreshing)}
                >
                  <RefreshCw className='mr-1.5 h-3.5 w-3.5' />
                  {t('Refresh')}
                </Button>
              )}
            </div>

            <div className='bg-muted/30 mt-3 rounded-md px-3'>
              <Field label={t('Email')} value={payload?.email} />
              <Field label={t('Organization')} value={payload?.orgName} />
              <Field label='Org ID' value={payload?.orgId} mono />
              <Field label={t('Auth Method')} value={payload?.authMethod} />
              <Field label={t('Provider')} value={payload?.apiProvider} />
              <Field label={t('Expires At')} value={payload?.expiresAt} />
              <Field label={t('Last Refresh')} value={payload?.lastRefresh} />
              <Field label={t('Rate Limit Tier')} value={payload?.rateLimitTier} />
            </div>
          </div>

          <div className='rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'>
            {payload?.usageMessage ||
              t(
                'Claude OAuth can show authorization status, but it does not expose subscription quota usage windows.'
              )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
