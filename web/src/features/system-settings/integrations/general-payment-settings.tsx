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
import { Code2, Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { JsonCodeEditor } from '@/components/json-code-editor'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { TabsContent } from '@/components/ui/tabs'

import { safeNumberFieldProps } from '../utils/numeric-field'
import { AmountDiscountVisualEditor } from './amount-discount-visual-editor'
import { AmountOptionsVisualEditor } from './amount-options-visual-editor'
import { paymentTabContentClassName } from './payment-layout'
import { PaymentMethodsVisualEditor } from './payment-methods-visual-editor'
import type { usePaymentSettings } from './use-payment-settings'

export function GeneralPaymentSettings({
  form,
  setPayMethodsVisualMode,
  payMethodsVisualMode,
  setAmountOptionsVisualMode,
  amountOptionsVisualMode,
  setAmountDiscountVisualMode,
  amountDiscountVisualMode,
}: {
  form: ReturnType<typeof usePaymentSettings>['form']
  setPayMethodsVisualMode: ReturnType<
    typeof usePaymentSettings
  >['setPayMethodsVisualMode']
  payMethodsVisualMode: ReturnType<
    typeof usePaymentSettings
  >['payMethodsVisualMode']
  setAmountOptionsVisualMode: ReturnType<
    typeof usePaymentSettings
  >['setAmountOptionsVisualMode']
  amountOptionsVisualMode: ReturnType<
    typeof usePaymentSettings
  >['amountOptionsVisualMode']
  setAmountDiscountVisualMode: ReturnType<
    typeof usePaymentSettings
  >['setAmountDiscountVisualMode']
  amountDiscountVisualMode: ReturnType<
    typeof usePaymentSettings
  >['amountDiscountVisualMode']
}) {
  const { t } = useTranslation()
  return (
    <TabsContent value='general' className={paymentTabContentClassName}>
      <div className='space-y-4'>
        <div>
          <h3 className='text-lg font-medium'>{t('General Settings')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t('Shared configuration for all payment gateways')}
          </p>
        </div>

        <div className='grid gap-6 md:grid-cols-2'>
          <FormField
            control={form.control}
            name='Price'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Price (local currency / USD)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    step='0.01'
                    min={0}
                    {...safeNumberFieldProps(field)}
                  />
                </FormControl>
                <FormDescription>
                  {t('How much to charge for each US dollar of balance (Epay)')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='MinTopUp'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Minimum top-up (USD)')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    step='0.01'
                    min={0}
                    {...safeNumberFieldProps(field)}
                  />
                </FormControl>
                <FormDescription>
                  {t('Smallest USD amount users can recharge (Epay)')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='PayMethods'
          render={({ field }) => (
            <FormItem>
              <div className='mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <FormLabel>{t('Payment methods')}</FormLabel>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => setPayMethodsVisualMode(!payMethodsVisualMode)}
                  className='w-full sm:w-auto'
                >
                  {payMethodsVisualMode ? (
                    <>
                      <Code2 className='mr-2 h-3 w-3' />
                      {t('JSON Editor')}
                    </>
                  ) : (
                    <>
                      <Eye className='mr-2 h-3 w-3' />
                      {t('Visual Editor')}
                    </>
                  )}
                </Button>
              </div>
              <FormControl>
                {payMethodsVisualMode ? (
                  <PaymentMethodsVisualEditor
                    value={field.value}
                    onChange={field.onChange}
                  />
                ) : (
                  <JsonCodeEditor
                    value={field.value}
                    onChange={field.onChange}
                    name={field.name}
                    onBlur={field.onBlur}
                    textareaRef={field.ref}
                    placeholder={t(
                      '[{"name":"支付宝","type":"alipay","icon":"SiAlipay"}]'
                    )}
                    heightClassName='h-40 min-h-40 max-h-40'
                    aria-invalid={Boolean(form.formState.errors.PayMethods)}
                  />
                )}
              </FormControl>
              <FormDescription>
                {t(
                  'Configured as PayMethods JSON. The type value decides which payment flow is used: stripe for Stripe, waffo_pancake for Waffo Pancake, and other values are sent to Epay as the type parameter.'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='grid gap-6 md:grid-cols-2 md:items-start'>
          <FormField
            control={form.control}
            name='AmountOptions'
            render={({ field }) => (
              <FormItem>
                <div className='mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                  <FormLabel>{t('Top-up amount options')}</FormLabel>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setAmountOptionsVisualMode(!amountOptionsVisualMode)
                    }
                    className='w-full sm:w-auto'
                  >
                    {amountOptionsVisualMode ? (
                      <>
                        <Code2 className='mr-2 h-3 w-3' />
                        {t('JSON Editor')}
                      </>
                    ) : (
                      <>
                        <Eye className='mr-2 h-3 w-3' />
                        {t('Visual Editor')}
                      </>
                    )}
                  </Button>
                </div>
                <FormControl>
                  {amountOptionsVisualMode ? (
                    <AmountOptionsVisualEditor
                      value={field.value}
                      onChange={field.onChange}
                    />
                  ) : (
                    <JsonCodeEditor
                      value={field.value}
                      onChange={field.onChange}
                      name={field.name}
                      onBlur={field.onBlur}
                      textareaRef={field.ref}
                      placeholder='[10, 20, 50, 100]'
                      heightClassName='h-40 min-h-40 max-h-40'
                      aria-invalid={Boolean(
                        form.formState.errors.AmountOptions
                      )}
                    />
                  )}
                </FormControl>
                <FormDescription>
                  {t('Preset recharge amounts (JSON array)')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='AmountDiscount'
            render={({ field }) => (
              <FormItem>
                <div className='mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                  <FormLabel>{t('Amount discount')}</FormLabel>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() =>
                      setAmountDiscountVisualMode(!amountDiscountVisualMode)
                    }
                    className='w-full sm:w-auto'
                  >
                    {amountDiscountVisualMode ? (
                      <>
                        <Code2 className='mr-2 h-3 w-3' />
                        {t('JSON Editor')}
                      </>
                    ) : (
                      <>
                        <Eye className='mr-2 h-3 w-3' />
                        {t('Visual Editor')}
                      </>
                    )}
                  </Button>
                </div>
                <FormControl>
                  {amountDiscountVisualMode ? (
                    <AmountDiscountVisualEditor
                      value={field.value}
                      onChange={field.onChange}
                    />
                  ) : (
                    <JsonCodeEditor
                      value={field.value}
                      onChange={field.onChange}
                      name={field.name}
                      onBlur={field.onBlur}
                      textareaRef={field.ref}
                      placeholder='{"100":0.95,"200":0.9}'
                      heightClassName='h-40 min-h-40 max-h-40'
                      aria-invalid={Boolean(
                        form.formState.errors.AmountDiscount
                      )}
                    />
                  )}
                </FormControl>
                <FormDescription>
                  {t('Discount map by recharge amount (JSON object)')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </TabsContent>
  )
}
