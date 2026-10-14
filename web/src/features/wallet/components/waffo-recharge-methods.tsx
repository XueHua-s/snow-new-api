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
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { getPaymentIcon } from '../lib'
import type { RechargeFormCardProps } from './use-recharge-form'

export function WaffoRechargeMethods({
  waffoPayMethods,
  waffoMinTopup,
  topupAmount,
  paymentLoading,
  onWaffoMethodSelect,
}: {
  waffoPayMethods: RechargeFormCardProps['waffoPayMethods']
  waffoMinTopup: RechargeFormCardProps['waffoMinTopup']
  topupAmount: RechargeFormCardProps['topupAmount']
  paymentLoading: RechargeFormCardProps['paymentLoading']
  onWaffoMethodSelect: NonNullable<RechargeFormCardProps['onWaffoMethodSelect']>
}) {
  const { t } = useTranslation()
  return (
    <div className='space-y-2.5 sm:space-y-3'>
      <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
        {t('Waffo Payment')}
      </Label>
      <div className='grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-3'>
        {waffoPayMethods?.map((method, index) => {
          const loadingKey = `waffo-${index}`
          const methodKey = `${method.payMethodType ?? 'unknown'}-${method.payMethodName ?? method.name}`
          const waffoMin = waffoMinTopup || 0
          const belowMin = waffoMin > topupAmount
          const disabledReason = belowMin
            ? t('Minimum topup amount: {{amount}}', {
                amount: waffoMin,
              })
            : undefined
          const disabledLabel = belowMin
            ? `${t('Minimum:')} ${waffoMin}`
            : undefined

          let methodIcon = getPaymentIcon('waffo')
          if (paymentLoading === loadingKey) {
            methodIcon = <Loader2 className='h-4 w-4 animate-spin' />
          } else if (method.icon) {
            methodIcon = (
              <img
                src={method.icon}
                alt={method.name}
                className='h-4 w-4 object-contain'
              />
            )
          }

          const button = (
            <Button
              key={methodKey}
              variant='outline'
              onClick={() => onWaffoMethodSelect(method, index)}
              disabled={belowMin || !!paymentLoading}
              title={disabledReason}
              aria-label={
                disabledReason
                  ? `${method.name}. ${disabledReason}`
                  : method.name
              }
              className='min-h-14 min-w-0 justify-start gap-2 rounded-lg px-3 py-2 text-left'
            >
              {methodIcon}
              <span className='flex min-w-0 flex-col items-start gap-0.5'>
                <span className='max-w-full truncate'>{method.name}</span>
                {disabledLabel && (
                  <span className='text-muted-foreground max-w-full truncate text-[11px] leading-4 font-normal'>
                    {disabledLabel}
                  </span>
                )}
              </span>
            </Button>
          )

          return belowMin ? (
            <TooltipProvider key={methodKey}>
              <Tooltip>
                <TooltipTrigger render={button} />
                <TooltipContent>{disabledReason}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            button
          )
        })}
      </div>
    </div>
  )
}
