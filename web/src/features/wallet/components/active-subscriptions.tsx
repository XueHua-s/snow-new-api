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
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  StatusBadge,
  dotColorMap,
  textColorMap,
} from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  type useSubscriptionPurchase,
  getBillingPreferenceLabel,
} from './use-subscription-purchase'

export function ActiveSubscriptions({
  hasActive,
  activeSubscriptions,
  allSubscriptions,
  disablePref,
  displayPref,
  handlePreferenceChange,
  handleRefresh,
  refreshing,
  isSubPref,
  billingPreference,
  hasAny,
  planTitleMap,
  getRemainingDays,
  getUsagePercent,
}: {
  hasActive: ReturnType<typeof useSubscriptionPurchase>['hasActive']
  activeSubscriptions: ReturnType<
    typeof useSubscriptionPurchase
  >['activeSubscriptions']
  allSubscriptions: ReturnType<
    typeof useSubscriptionPurchase
  >['allSubscriptions']
  disablePref: ReturnType<typeof useSubscriptionPurchase>['disablePref']
  displayPref: ReturnType<typeof useSubscriptionPurchase>['displayPref']
  handlePreferenceChange: ReturnType<
    typeof useSubscriptionPurchase
  >['handlePreferenceChange']
  handleRefresh: ReturnType<typeof useSubscriptionPurchase>['handleRefresh']
  refreshing: ReturnType<typeof useSubscriptionPurchase>['refreshing']
  isSubPref: ReturnType<typeof useSubscriptionPurchase>['isSubPref']
  billingPreference: ReturnType<
    typeof useSubscriptionPurchase
  >['billingPreference']
  hasAny: ReturnType<typeof useSubscriptionPurchase>['hasAny']
  planTitleMap: ReturnType<typeof useSubscriptionPurchase>['planTitleMap']
  getRemainingDays: ReturnType<
    typeof useSubscriptionPurchase
  >['getRemainingDays']
  getUsagePercent: ReturnType<typeof useSubscriptionPurchase>['getUsagePercent']
}) {
  const { t } = useTranslation()
  return (
    <div className='rounded-xl border p-3 sm:p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2.5 sm:gap-3'>
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <span className='text-sm font-medium'>{t('My Subscriptions')}</span>
          <span className='flex items-center gap-1.5 text-xs font-medium'>
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                hasActive ? dotColorMap.success : dotColorMap.neutral
              )}
              aria-hidden='true'
            />
            {hasActive ? (
              <span className={cn(textColorMap.success)}>
                {activeSubscriptions.length} {t('active')}
              </span>
            ) : (
              <span className='text-muted-foreground'>{t('No Active')}</span>
            )}
            {allSubscriptions.length > activeSubscriptions.length && (
              <>
                <span className='text-muted-foreground/30'>·</span>
                <span className='text-muted-foreground'>
                  {allSubscriptions.length - activeSubscriptions.length}{' '}
                  {t('expired')}
                </span>
              </>
            )}
          </span>
        </div>
        <div className='flex w-full items-center gap-2 sm:w-auto'>
          <Select
            items={[
              {
                value: 'subscription_first',
                label: (
                  <>
                    {getBillingPreferenceLabel('subscription_first', t)}
                    {disablePref ? ` (${t('No Active')})` : ''}
                  </>
                ),
              },
              {
                value: 'wallet_first',
                label: getBillingPreferenceLabel('wallet_first', t),
              },
              {
                value: 'subscription_only',
                label: (
                  <>
                    {getBillingPreferenceLabel('subscription_only', t)}
                    {disablePref ? ` (${t('No Active')})` : ''}
                  </>
                ),
              },
              {
                value: 'wallet_only',
                label: getBillingPreferenceLabel('wallet_only', t),
              },
            ]}
            value={displayPref}
            onValueChange={(v) => v !== null && handlePreferenceChange(v)}
          >
            <SelectTrigger className='h-8 flex-1 text-xs sm:w-[140px] sm:flex-none'>
              <SelectValue>
                {getBillingPreferenceLabel(displayPref, t)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value='subscription_first' disabled={disablePref}>
                  {getBillingPreferenceLabel('subscription_first', t)}
                  {disablePref ? ` (${t('No Active')})` : ''}
                </SelectItem>
                <SelectItem value='wallet_first'>
                  {getBillingPreferenceLabel('wallet_first', t)}
                </SelectItem>
                <SelectItem value='subscription_only' disabled={disablePref}>
                  {getBillingPreferenceLabel('subscription_only', t)}
                  {disablePref ? ` (${t('No Active')})` : ''}
                </SelectItem>
                <SelectItem value='wallet_only'>
                  {getBillingPreferenceLabel('wallet_only', t)}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8'
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>

      {disablePref && isSubPref && (
        <p className='text-muted-foreground mt-2 text-xs'>
          {t(
            'Preference saved as {{pref}}, but no active subscription. Wallet will be used automatically.',
            {
              pref:
                billingPreference === 'subscription_only'
                  ? t('Subscription Only')
                  : t('Subscription First'),
            }
          )}
        </p>
      )}

      {hasAny && (
        <>
          <Separator className='my-3' />
          <div className='max-h-64 space-y-3 overflow-y-auto pr-1'>
            {allSubscriptions.map((sub) => {
              const subscription = sub.subscription
              const totalAmount = Number(subscription?.amount_total || 0)
              const usedAmount = Number(subscription?.amount_used || 0)
              const remainAmount =
                totalAmount > 0 ? Math.max(0, totalAmount - usedAmount) : 0
              const planTitle = planTitleMap.get(subscription?.plan_id) || ''
              const remainDays = getRemainingDays(sub)
              const usagePercent = getUsagePercent(sub)
              const now = Date.now() / 1000
              const isExpired = (subscription?.end_time || 0) < now
              const isCancelled = subscription?.status === 'cancelled'
              const isActive = subscription?.status === 'active' && !isExpired
              const nextResetTime = subscription?.next_reset_time ?? 0
              let statusBadge = (
                <StatusBadge
                  label={t('Expired')}
                  variant='neutral'
                  copyable={false}
                />
              )
              if (isActive) {
                statusBadge = (
                  <StatusBadge
                    label={t('Active')}
                    variant='success'
                    copyable={false}
                  />
                )
              } else if (isCancelled) {
                statusBadge = (
                  <StatusBadge
                    label={t('Cancelled')}
                    variant='neutral'
                    copyable={false}
                  />
                )
              }

              let endTimeLabel = t('Expired at')
              if (isActive) {
                endTimeLabel = t('Until')
              } else if (isCancelled) {
                endTimeLabel = t('Cancelled at')
              }

              return (
                <div
                  key={subscription?.id}
                  className='bg-background rounded-md border p-3 text-xs'
                >
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium'>
                        {planTitle
                          ? `${planTitle} · ${t('Subscription')} #${subscription?.id}`
                          : `${t('Subscription')} #${subscription?.id}`}
                      </span>
                      {statusBadge}
                    </div>
                    {isActive && (
                      <span className='text-muted-foreground'>
                        {t('{{count}} days remaining', {
                          count: remainDays,
                        })}
                      </span>
                    )}
                  </div>
                  <div className='text-muted-foreground mt-1.5'>
                    {endTimeLabel}{' '}
                    {new Date(
                      (subscription?.end_time || 0) * 1000
                    ).toLocaleString()}
                  </div>
                  {isActive && nextResetTime > 0 && (
                    <div className='text-muted-foreground mt-1'>
                      {t('Next reset')}:{' '}
                      {new Date(nextResetTime * 1000).toLocaleString()}
                    </div>
                  )}
                  <div className='text-muted-foreground mt-1'>
                    {t('Total Quota')}:{' '}
                    {totalAmount > 0 ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={<span className='cursor-help' />}
                        >
                          {formatQuota(usedAmount)}/{formatQuota(totalAmount)} ·{' '}
                          {t('Remaining')} {formatQuota(remainAmount)}
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('Raw Quota')}: {usedAmount}/{totalAmount} ·{' '}
                          {t('Remaining')} {remainAmount}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      t('Unlimited')
                    )}
                    {totalAmount > 0 && (
                      <span className='ml-2'>
                        {t('Used')} {usagePercent}%
                      </span>
                    )}
                  </div>
                  {totalAmount > 0 && isActive && (
                    <Progress value={usagePercent} className='mt-2 h-1.5' />
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {!hasAny && (
        <p className='text-muted-foreground mt-2 text-xs'>
          {t('Subscribe to a plan for model access')}
        </p>
      )}
    </div>
  )
}
