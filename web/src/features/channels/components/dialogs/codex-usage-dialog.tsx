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
import { Copy, Check, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'

import {
  InfoField,
  SectionHeading,
  RateLimitWindowGrid,
  RateLimitGroupSection,
} from './codex-rate-limits'
import { ResetCreditsPanel } from './codex-reset-credits'
import { getUsageStatusBadge, formatLabelValue } from './codex-usage-data'
import { type CodexUsageDialogProps, useCodexUsage } from './use-codex-usage'

export function CodexUsageDialog({
  open,
  onOpenChange,
  channelName,
  channelId,
  channelDisplayName,
  channelDisplayId,
  response,
  onRefresh,
  isRefreshing,
}: CodexUsageDialogProps) {
  const { t } = useTranslation()
  const {
    copiedText,
    copyToClipboard,
    showRawJson,
    setShowRawJson,
    showResetCredits,
    resetCreditsResponse,
    isLoadingResetCredits,
    resetCreditsError,
    resetConfirmOpen,
    setResetConfirmOpen,
    isResetting,
    resetActionError,
    setResetActionError,
    resetActionMessage,
    setResetActionMessage,
    payload,
    resetCreditsPayload,
    rateLimit,
    accountBadge,
    additionalRateLimits,
    resetCredits,
    resetCreditsText,
    canResetCodexUsage,
    channelLabel,
    fiveHourWindow,
    weeklyWindow,
    errorMessage,
    loadResetCredits,
    handleResetCreditsOpenChange,
    handleDialogOpenChange,
    handleConfirmReset,
    rawJsonText,
  } = useCodexUsage({
    open,
    onOpenChange,
    channelName,
    channelId,
    channelDisplayName,
    channelDisplayId,
    response,
    onRefresh,
    isRefreshing,
  })
  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
      title={t('Codex Account & Usage')}
      contentClassName='sm:max-w-[900px]'
      titleClassName='flex items-center gap-2'
      contentHeight='auto'
      bodyClassName='flex flex-col gap-4'
      footer={
        <Button
          type='button'
          variant='outline'
          onClick={() => handleDialogOpenChange(false)}
        >
          {t('Close')}
        </Button>
      }
    >
      <div className='flex flex-col gap-4'>
        {errorMessage && (
          <div className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'>
            {errorMessage}
          </div>
        )}

        <Card size='sm' className='bg-muted/30 gap-0 py-0'>
          <CardHeader className='p-4 pb-2'>
            <CardTitle className='text-muted-foreground text-xs font-medium'>
              {t('Codex Account Status')}
            </CardTitle>
            {onRefresh ? (
              <CardAction>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={onRefresh}
                  disabled={Boolean(isRefreshing)}
                >
                  <RefreshCw data-icon='inline-start' />
                  {t('Refresh')}
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className='p-4 pt-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <StatusBadge
                label={accountBadge.label}
                variant={accountBadge.variant}
                copyable={false}
              />
              {getUsageStatusBadge(rateLimit, t)}
              <StatusBadge
                label={`HTTP ${response?.upstream_status ?? '-'}`}
                variant='neutral'
                copyable={false}
              />
              <StatusBadge
                label={formatLabelValue(t('Reset count:'), resetCreditsText)}
                variant={Number(resetCredits) > 0 ? 'blue' : 'neutral'}
                copyable={false}
              />
              {payload?.credits?.overage_limit_reached ? (
                <StatusBadge
                  label={t('Overage limited')}
                  variant='danger'
                  copyable={false}
                />
              ) : null}
              {payload?.spend_control?.reached ? (
                <StatusBadge
                  label={t('Spend limited')}
                  variant='danger'
                  copyable={false}
                />
              ) : null}
            </div>
            <div className='mt-4 grid grid-cols-1 gap-3 md:grid-cols-2'>
              <InfoField label={t('Email')} value={payload?.email} copyable />
              <InfoField
                label={t('Channel')}
                value={channelLabel}
                copyable={false}
              />
              <InfoField
                label='User ID'
                value={payload?.user_id}
                mono
                className='md:col-span-2'
              />
            </div>
          </CardContent>
        </Card>

        <Collapsible
          open={showResetCredits}
          onOpenChange={handleResetCreditsOpenChange}
          className='rounded-lg border'
        >
          <CollapsibleTrigger
            render={
              <button
                type='button'
                className='hover:bg-muted/40 flex w-full items-start justify-between gap-3 p-3 text-left transition-colors'
                aria-expanded={showResetCredits}
              />
            }
          >
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-2'>
                <div className='text-sm font-semibold'>
                  {t('Reset Credits')}
                </div>
                <StatusBadge
                  label={`${t('Available')} ${resetCreditsText}`}
                  variant={Number(resetCredits) > 0 ? 'blue' : 'neutral'}
                  copyable={false}
                />
              </div>
              <div className='text-muted-foreground mt-1 text-xs leading-5'>
                {t('View issued reset credits, grant dates, and expiration.')}
              </div>
            </div>
            {showResetCredits ? (
              <ChevronUp className='text-muted-foreground mt-0.5 shrink-0' />
            ) : (
              <ChevronDown className='text-muted-foreground mt-0.5 shrink-0' />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className='border-t'>
            <ResetCreditsPanel
              payload={resetCreditsPayload}
              response={resetCreditsResponse}
              usageAvailableCount={resetCreditsText}
              isLoading={isLoadingResetCredits}
              isResetting={isResetting}
              errorMessage={resetCreditsError}
              resetErrorMessage={resetActionError}
              resetSuccessMessage={resetActionMessage}
              onRefresh={() => void loadResetCredits(true)}
              onRequestReset={() => {
                setResetActionError('')
                setResetActionMessage('')
                setResetConfirmOpen(true)
              }}
            />
          </CollapsibleContent>
        </Collapsible>

        <div className='flex flex-col gap-3'>
          <SectionHeading
            title={t('Base Limits')}
            description={t('Base rate limit windows for this account.')}
          >
            {getUsageStatusBadge(rateLimit, t)}
          </SectionHeading>
          <RateLimitWindowGrid
            fiveHourWindow={fiveHourWindow}
            weeklyWindow={weeklyWindow}
          />
        </div>

        {additionalRateLimits.length > 0 ? (
          <div className='flex flex-col gap-3'>
            <SectionHeading
              title={t('Additional Limits')}
              description={t(
                'Per-feature metered windows split by model or capability.'
              )}
            />
            <div className='flex flex-col gap-3'>
              {additionalRateLimits.map((item) => {
                const limitName =
                  item.limit_name ||
                  item.metered_feature ||
                  t('Additional Limit')
                return (
                  <RateLimitGroupSection
                    key={`${limitName}-${item.metered_feature ?? ''}-${item.plan_type ?? ''}`}
                    title={limitName}
                    description={t('Additional metered capability')}
                    source={item}
                    meteredFeature={item.metered_feature}
                  />
                )
              })}
            </div>
          </div>
        ) : null}

        <Collapsible
          open={showRawJson}
          onOpenChange={setShowRawJson}
          className='rounded-lg border'
        >
          <CollapsibleTrigger
            render={
              <button
                type='button'
                className='hover:bg-muted/40 flex w-full items-center justify-between gap-2 p-3 transition-colors'
                aria-expanded={showRawJson}
              />
            }
          >
            <div className='text-sm font-medium'>{t('Raw JSON')}</div>
            {showRawJson ? (
              <ChevronUp className='text-muted-foreground h-4 w-4' />
            ) : (
              <ChevronDown className='text-muted-foreground h-4 w-4' />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
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
                    <Check data-icon='inline-start' className='text-success' />
                  ) : (
                    <Copy data-icon='inline-start' />
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
          </CollapsibleContent>
        </Collapsible>
      </div>
      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title={t('Confirm usage reset')}
        desc={
          <div className='flex flex-col gap-2'>
            <p>
              {t(
                'Use one available reset credit for this channel. The reset request is sent only after confirmation.'
              )}
            </p>
            <div className='bg-muted/50 rounded-lg border px-3 py-2 text-xs'>
              <div className='font-medium'>{channelLabel}</div>
              <div className='text-muted-foreground mt-1'>
                {t('Available reset credits')}: {resetCreditsText}
              </div>
            </div>
            <p className='text-destructive'>
              {t('Used reset credits cannot be restored.')}
            </p>
          </div>
        }
        destructive
        disabled={!canResetCodexUsage}
        isLoading={isResetting}
        cancelBtnText={t('Cancel')}
        confirmText={isResetting ? t('Resetting...') : t('Apply reset')}
        handleConfirm={handleConfirmReset}
      />
    </Dialog>
  )
}

export { type CodexUsageDialogData } from './codex-usage-data'
