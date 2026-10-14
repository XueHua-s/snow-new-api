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
import { WalletCards } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  SideDrawerSection,
  SideDrawerSectionHeader,
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
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import type { useApiKeyForm } from './use-api-key-form'

export function ApiKeyQuotaFields({
  unlimitedQuota,
  form,
  quotaLabel,
  tokensOnly,
  quotaPlaceholder,
  currencyLabel,
}: {
  unlimitedQuota: ReturnType<typeof useApiKeyForm>['unlimitedQuota']
  form: ReturnType<typeof useApiKeyForm>['form']
  quotaLabel: ReturnType<typeof useApiKeyForm>['quotaLabel']
  tokensOnly: ReturnType<typeof useApiKeyForm>['tokensOnly']
  quotaPlaceholder: ReturnType<typeof useApiKeyForm>['quotaPlaceholder']
  currencyLabel: ReturnType<typeof useApiKeyForm>['currencyLabel']
}) {
  const { t } = useTranslation()
  return (
    <SideDrawerSection>
      <SideDrawerSectionHeader
        title={t('Quota Settings')}
        description={t('Set quota amount and limits')}
        icon={<WalletCards className='size-4' />}
        iconTone='success'
      />
      {!unlimitedQuota && (
        <FormField
          control={form.control}
          name='remain_quota_dollars'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{quotaLabel}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type='number'
                  step={tokensOnly ? 1 : 0.01}
                  placeholder={quotaPlaceholder}
                  onChange={(e) =>
                    field.onChange(Number.parseFloat(e.target.value) || 0)
                  }
                />
              </FormControl>
              <FormDescription>
                {tokensOnly
                  ? t('Enter the quota amount in tokens')
                  : t('Enter the quota amount in {{currency}}', {
                      currency: currencyLabel,
                    })}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name='unlimited_quota'
        render={({ field }) => (
          <FormItem className={sideDrawerSwitchItemClassName()}>
            <div className='flex flex-col gap-0.5'>
              <FormLabel className='text-sm'>{t('Unlimited Quota')}</FormLabel>
              <FormDescription className='text-xs'>
                {t('Enable unlimited quota for this API key')}
              </FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
    </SideDrawerSection>
  )
}
