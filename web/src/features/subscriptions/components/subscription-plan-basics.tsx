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
import { Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  SideDrawerSection,
  sideDrawerSwitchItemClassName,
} from '@/components/drawer-layout'
import {
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
import { Switch } from '@/components/ui/switch'

import type { useSubscriptionForm } from './use-subscription-form'

export function SubscriptionPlanBasics({
  form,
  currencyLabel,
  tokensOnly,
  groupOptions,
}: {
  form: ReturnType<typeof useSubscriptionForm>['form']
  currencyLabel: ReturnType<typeof useSubscriptionForm>['currencyLabel']
  tokensOnly: ReturnType<typeof useSubscriptionForm>['tokensOnly']
  groupOptions: ReturnType<typeof useSubscriptionForm>['groupOptions']
}) {
  const { t } = useTranslation()
  return (
    <SideDrawerSection>
      <h3 className='flex items-center gap-2 text-sm font-medium'>
        <IconBadge tone='info' size='xs'>
          <Settings2 />
        </IconBadge>
        {t('Basic Info')}
      </h3>

      <FormField
        control={form.control}
        name='title'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Plan Title')}</FormLabel>
            <FormControl>
              <Input {...field} placeholder={t('e.g. Basic Plan')} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='subtitle'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Plan Subtitle')}</FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder={t('e.g. Suitable for light usage')}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <FormField
          control={form.control}
          name='price_amount'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Plan Price')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type='number'
                  step='0.01'
                  min={0}
                  onChange={(e) =>
                    field.onChange(Number.parseFloat(e.target.value) || 0)
                  }
                />
              </FormControl>
              <FormDescription>
                {t(
                  'Amount the user pays to purchase this plan; the actual currency depends on the payment gateway.'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='total_amount'
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('Quota ({{currency}})', { currency: currencyLabel })}
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type='number'
                  min={0}
                  step={tokensOnly ? 1 : 0.01}
                  placeholder={
                    tokensOnly
                      ? t('Enter quota in tokens')
                      : t('Enter quota in {{currency}}', {
                          currency: currencyLabel,
                        })
                  }
                  onChange={(e) =>
                    field.onChange(Number.parseFloat(e.target.value) || 0)
                  }
                />
              </FormControl>
              <FormDescription>
                {t(
                  'Total quota included in the plan, usable per billing period. 0 means unlimited.'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <FormField
          control={form.control}
          name='upgrade_group'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Upgrade Group')}</FormLabel>
              <Select
                items={[
                  { value: '__none__', label: t('No Upgrade') },
                  ...groupOptions.map((g) => ({ value: g, label: g })),
                ]}
                onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                value={field.value || ''}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('No Upgrade')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='__none__'>{t('No Upgrade')}</SelectItem>
                    {groupOptions.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
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
          name='downgrade_group'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Downgrade Group')}</FormLabel>
              <Select
                items={[
                  {
                    value: '__none__',
                    label: t('Downgrade to pre-purchase group'),
                  },
                  ...groupOptions.map((g) => ({ value: g, label: g })),
                ]}
                onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                value={field.value || ''}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t('Downgrade to pre-purchase group')}
                    />
                  </SelectTrigger>
                </FormControl>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='__none__'>
                      {t('Downgrade to pre-purchase group')}
                    </SelectItem>
                    {groupOptions.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormDescription>
                {t('Downgrade to this group after the subscription expires')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='max_purchase_per_user'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Purchase Limit')}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type='number'
                  min={0}
                  onChange={(e) =>
                    field.onChange(Number.parseInt(e.target.value, 10) || 0)
                  }
                />
              </FormControl>
              <FormDescription>{t('0 means unlimited')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name='sort_order'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Sort Order')}</FormLabel>
            <FormControl>
              <Input
                {...field}
                type='number'
                onChange={(e) =>
                  field.onChange(Number.parseInt(e.target.value, 10) || 0)
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className='flex flex-col gap-3'>
        <FormField
          control={form.control}
          name='enabled'
          render={({ field }) => (
            <FormItem className={sideDrawerSwitchItemClassName()}>
              <FormLabel className='!mt-0'>{t('Enabled Status')}</FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='allow_balance_pay'
          render={({ field }) => (
            <FormItem className={sideDrawerSwitchItemClassName()}>
              <FormLabel className='!mt-0'>
                {t('Allow balance redemption')}
              </FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='allow_wallet_overflow'
          render={({ field }) => (
            <FormItem className={sideDrawerSwitchItemClassName()}>
              <FormLabel className='!mt-0'>
                {t('Allow wallet balance after quota used up')}
              </FormLabel>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </SideDrawerSection>
  )
}
