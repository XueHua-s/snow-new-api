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
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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

import { paymentTabContentClassName } from './payment-layout'
import type { usePaymentSettings } from './use-payment-settings'

export function EpayPaymentSettings({
  form,
}: {
  form: ReturnType<typeof usePaymentSettings>['form']
}) {
  const { t } = useTranslation()
  return (
    <TabsContent value='epay' className={paymentTabContentClassName}>
      <div className='space-y-4'>
        <div>
          <h3 className='text-lg font-medium'>{t('Epay Gateway')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t('Configuration for Epay payment integration')}
          </p>
        </div>

        <Alert>
          <ShieldAlert className='h-4 w-4' />
          <AlertTitle>{t('Epay safety reminder')}</AlertTitle>
          <AlertDescription>
            {t(
              'Epay is a payment protocol, not a specific official website. Verify the provider yourself and do not trust random third-party Epay deployments.'
            )}
          </AlertDescription>
        </Alert>

        <div className='grid gap-6 md:grid-cols-2'>
          <FormField
            control={form.control}
            name='PayAddress'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Epay endpoint')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('https://pay.example.com')}
                    {...field}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                </FormControl>
                <FormDescription>
                  {t('Base address provided by your Epay service')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='CustomCallbackAddress'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Callback address')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('https://gateway.example.com')}
                    {...field}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Only enter the site origin, for example https://api.example.com. Do not include any path such as /api/user/epay/notify. Leave blank to use the server address.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid gap-6 md:grid-cols-2'>
          <FormField
            control={form.control}
            name='EpayId'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Epay merchant ID')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder='10001'
                    autoComplete='off'
                    {...field}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='EpayKey'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Epay secret key')}</FormLabel>
                <FormControl>
                  <Input
                    type='password'
                    placeholder={t('Enter new key to update')}
                    autoComplete='new-password'
                    {...field}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                </FormControl>
                <FormDescription>
                  {t('Leave blank unless rotating the secret')}
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
