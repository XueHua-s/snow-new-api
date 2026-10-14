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
import { CalendarClock, CreditCard, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  SideDrawerSection,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { SubscriptionPlanBasics } from './subscription-plan-basics'
import { type Props, useSubscriptionForm } from './use-subscription-form'

export function SubscriptionsMutateDrawer({
  open,
  onOpenChange,
  currentRow,
}: Props) {
  const { t } = useTranslation()
  const {
    isEdit,
    tokensOnly,
    currencyLabel,
    isSubmitting,
    groupOptions,
    creatingPancakeProduct,
    pancakeProducts,
    form,
    durationUnit,
    resetPeriod,
    pancakeCreateReady,
    onSubmit,
    handleCreatePancakeProduct,
    durationUnitOpts,
    resetPeriodOpts,
  } = useSubscriptionForm({ open, onOpenChange, currentRow })
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          form.reset()
        }
      }}
    >
      <SheetContent className={sideDrawerContentClassName('sm:max-w-[600px]')}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {isEdit ? t('Update plan info') : t('Create new subscription plan')}
          </SheetTitle>
          <SheetDescription>
            {isEdit
              ? t('Modify existing subscription plan configuration')
              : t(
                  'Fill in the following info to create a new subscription plan'
                )}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='subscription-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className={sideDrawerFormClassName()}
          >
            {/* Basic Info */}
            <SubscriptionPlanBasics
              form={form}
              currencyLabel={currencyLabel}
              tokensOnly={tokensOnly}
              groupOptions={groupOptions}
            />

            {/* Duration Settings */}
            <SideDrawerSection>
              <h3 className='flex items-center gap-2 text-sm font-medium'>
                <IconBadge tone='chart-4' size='xs'>
                  <CalendarClock />
                </IconBadge>
                {t('Duration Settings')}
              </h3>

              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='duration_unit'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Duration Unit')}</FormLabel>
                      <Select
                        items={durationUnitOpts.map((o) => ({
                          value: o.value,
                          label: o.label,
                        }))}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {durationUnitOpts.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {durationUnit === 'custom' ? (
                  <FormField
                    control={form.control}
                    name='custom_seconds'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Custom Seconds')}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type='number'
                            min={1}
                            onChange={(e) =>
                              field.onChange(
                                Number.parseInt(e.target.value, 10) || 0
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name='duration_value'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Duration Value')}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type='number'
                            min={1}
                            onChange={(e) =>
                              field.onChange(
                                Number.parseInt(e.target.value, 10) || 0
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </SideDrawerSection>

            {/* Quota Reset */}
            <SideDrawerSection>
              <h3 className='flex items-center gap-2 text-sm font-medium'>
                <IconBadge tone='success' size='xs'>
                  <RefreshCw />
                </IconBadge>
                {t('Quota Reset')}
              </h3>

              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='quota_reset_period'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Reset Cycle')}</FormLabel>
                      <Select
                        items={resetPeriodOpts.map((o) => ({
                          value: o.value,
                          label: o.label,
                        }))}
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {resetPeriodOpts.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='quota_reset_custom_seconds'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Custom Seconds')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type='number'
                          min={0}
                          disabled={resetPeriod !== 'custom'}
                          onChange={(e) =>
                            field.onChange(
                              Number.parseInt(e.target.value, 10) || 0
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </SideDrawerSection>

            {/* Payment Config */}
            <SideDrawerSection>
              <h3 className='flex items-center gap-2 text-sm font-medium'>
                <IconBadge tone='warning' size='xs'>
                  <CreditCard />
                </IconBadge>
                {t('Third-party Payment Config')}
              </h3>

              <FormField
                control={form.control}
                name='stripe_price_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stripe Price ID</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='price_...' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='creem_product_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Creem Product ID</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder='prod_...' />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='waffo_pancake_product_id'
                render={({ field }) => {
                  // Raw-ID fallback for IDs not yet in the catalog.
                  const items = pancakeProducts.map((p) => ({
                    value: p.id,
                    label: `${p.name} (${p.id})`,
                  }))
                  if (
                    field.value &&
                    !pancakeProducts.some((p) => p.id === field.value)
                  ) {
                    items.push({ value: field.value, label: field.value })
                  }
                  return (
                    <FormItem>
                      <FormLabel>Waffo Pancake Product ID</FormLabel>
                      <div className='flex gap-2'>
                        <Select
                          items={items}
                          value={field.value || ''}
                          onValueChange={(v) => field.onChange(v)}
                          disabled={items.length === 0}
                        >
                          <SelectTrigger className='w-full flex-1'>
                            <SelectValue placeholder={t('Select a product')} />
                          </SelectTrigger>
                          <SelectContent>
                            {items.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type='button'
                          variant='outline'
                          onClick={handleCreatePancakeProduct}
                          disabled={
                            creatingPancakeProduct || !pancakeCreateReady
                          }
                          className='shrink-0'
                        >
                          {creatingPancakeProduct
                            ? t('Creating...')
                            : `+ ${t('Create')}`}
                        </Button>
                      </div>
                      <FormDescription>
                        {t(
                          'Creates a Pancake product in the saved store using this plan’s title and price. Requires Waffo Pancake to be fully configured in Payment settings first.'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )
                }}
              />
            </SideDrawerSection>
          </form>
        </Form>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <SheetClose render={<Button variant='outline' />}>
            {t('Close')}
          </SheetClose>
          <Button
            form='subscription-form'
            type='submit'
            disabled={isSubmitting}
          >
            {isSubmitting ? t('Saving...') : t('Save changes')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
