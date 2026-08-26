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
import { useMemo, useState, type ReactNode } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Hash,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
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

function getText(value: unknown) {
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

function CopyableField(props: {
  icon: ReactNode
  label: string
  value?: unknown
  mono?: boolean
}) {
  const { copyToClipboard, copiedText } = useCopyToClipboard({ notify: false })
  const text = getText(props.value).trim()
  const hasCopied = copiedText === text

  return (
    <div className='flex items-center justify-between gap-2 py-1'>
      <div className='flex min-w-0 items-center gap-2'>
        <span className='text-muted-foreground flex-shrink-0'>
          {props.icon}
        </span>
        <span className='text-muted-foreground flex-shrink-0 text-xs'>
          {props.label}
        </span>
        <span
          className={`min-w-0 truncate text-xs ${props.mono ? 'font-mono' : ''}`}
        >
          {text || '-'}
        </span>
      </div>
      {text && (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-6 w-6 flex-shrink-0 p-0'
          onClick={() => copyToClipboard(text)}
        >
          {hasCopied ? (
            <Check className='h-3 w-3 text-green-600' />
          ) : (
            <Copy className='h-3 w-3' />
          )}
        </Button>
      )}
    </div>
  )
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
          props.mono ? 'font-mono text-xs break-all' : 'text-sm break-words'
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
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const [showRawJson, setShowRawJson] = useState(false)
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

  const rawJsonText = useMemo(() => {
    if (!response) return ''
    try {
      return JSON.stringify(
        {
          success: response.success,
          message: response.message,
          upstream_status: response.upstream_status,
          data: response.data,
        },
        null,
        2
      )
    } catch {
      return String(response?.data ?? '')
    }
  }, [response])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-3xl'>
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

          {/* Account summary */}
          <div className='rounded-lg border p-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex flex-wrap items-center gap-2'>
                <StatusBadge
                  label={payload?.loggedIn ? t('Authorized') : t('Unavailable')}
                  variant={payload?.loggedIn ? 'success' : 'neutral'}
                  copyable={false}
                />
                <StatusBadge
                  label={payload?.apiProvider || 'Claude(OAuth)'}
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

            {/* Account identity info */}
            <div className='bg-muted/30 mt-3 rounded-md px-3 py-2'>
              <CopyableField
                icon={<Mail className='h-3.5 w-3.5' />}
                label={t('Email')}
                value={payload?.email}
              />
              <CopyableField
                icon={<ShieldCheck className='h-3.5 w-3.5' />}
                label={t('Organization')}
                value={payload?.orgName}
              />
              <CopyableField
                icon={<Hash className='h-3.5 w-3.5' />}
                label='Org ID'
                value={payload?.orgId}
                mono
              />
              <CopyableField
                icon={<ShieldCheck className='h-3.5 w-3.5' />}
                label={t('Auth Method')}
                value={payload?.authMethod}
              />
              <CopyableField
                icon={<Clock className='h-3.5 w-3.5' />}
                label={t('Expires At')}
                value={payload?.expiresAt}
              />
              <CopyableField
                icon={<Clock className='h-3.5 w-3.5' />}
                label={t('Last Refresh')}
                value={payload?.lastRefresh}
              />
              <Field
                label={t('Subscription')}
                value={payload?.subscriptionType}
              />
              <Field
                label={t('Rate Limit Tier')}
                value={payload?.rateLimitTier}
              />
            </div>
          </div>

          <div className='rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'>
            {payload?.usageMessage ||
              t(
                'Claude OAuth can show authorization status, but it does not expose subscription quota usage windows.'
              )}
          </div>

          {/* Raw JSON collapsible */}
          <div className='rounded-lg border'>
            <button
              type='button'
              className='hover:bg-muted/40 flex w-full items-center justify-between gap-2 p-3 transition-colors'
              onClick={() => setShowRawJson((v) => !v)}
            >
              <div className='text-sm font-medium'>{t('Raw JSON')}</div>
              {showRawJson ? (
                <ChevronUp className='text-muted-foreground h-4 w-4' />
              ) : (
                <ChevronDown className='text-muted-foreground h-4 w-4' />
              )}
            </button>
            {showRawJson && (
              <>
                <div className='flex justify-end border-t px-3 py-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => copyToClipboard(rawJsonText)}
                    disabled={!rawJsonText}
                  >
                    {copiedText === rawJsonText ? (
                      <Check className='mr-1.5 h-3.5 w-3.5 text-green-600' />
                    ) : (
                      <Copy className='mr-1.5 h-3.5 w-3.5' />
                    )}
                    {t('Copy')}
                  </Button>
                </div>
                <ScrollArea className='max-h-[50vh]'>
                  <pre className='bg-muted/30 m-0 p-3 text-xs break-words whitespace-pre-wrap'>
                    {rawJsonText || '-'}
                  </pre>
                </ScrollArea>
              </>
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
