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
import { Switch } from '@/components/ui/switch'
import { TabsContent } from '@/components/ui/tabs'

import {
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { CreemProductsVisualEditor } from './creem-products-visual-editor'
import { paymentTabContentClassName } from './payment-layout'
import type { usePaymentSettings } from './use-payment-settings'

export function CreemPaymentSettings({
  form,
  setCreemProductsVisualMode,
  creemProductsVisualMode,
}: {
  form: ReturnType<typeof usePaymentSettings>['form']
  setCreemProductsVisualMode: ReturnType<
    typeof usePaymentSettings
  >['setCreemProductsVisualMode']
  creemProductsVisualMode: ReturnType<
    typeof usePaymentSettings
  >['creemProductsVisualMode']
}) {
  const { t } = useTranslation()
  return (
    <TabsContent value='creem' className={paymentTabContentClassName}>
      <div className='space-y-4'>
        <div>
          <h3 className='text-lg font-medium'>{t('Creem Gateway')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t('Configuration for Creem payment integration')}
          </p>
        </div>

        <div className='rounded-md bg-blue-50 p-4 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-100'>
          <p className='mb-2 font-medium'>{t('Webhook Configuration:')}</p>
          <ul className='list-inside list-disc space-y-1'>
            <li>
              {t('Webhook URL:')}{' '}
              <code className='rounded bg-blue-100 px-1 py-0.5 text-xs dark:bg-blue-900'>
                {'<ServerAddress>/api/creem/webhook'}
              </code>
            </li>
            <li>{t('Configure in your Creem dashboard')}</li>
          </ul>
        </div>

        <div className='grid gap-6 md:grid-cols-2'>
          <FormField
            control={form.control}
            name='CreemApiKey'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('API Key')}</FormLabel>
                <FormControl>
                  <Input
                    type='password'
                    placeholder={t('Enter Creem API key')}
                    autoComplete='new-password'
                    {...field}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                </FormControl>
                <FormDescription>
                  {t('Creem API key (leave blank unless updating)')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='CreemWebhookSecret'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Webhook Secret')}</FormLabel>
                <FormControl>
                  <Input
                    type='password'
                    placeholder={t('Enter webhook secret')}
                    autoComplete='new-password'
                    {...field}
                    onChange={(event) => field.onChange(event.target.value)}
                  />
                </FormControl>
                <FormDescription>
                  {t('Webhook signing secret (leave blank unless updating)')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='CreemTestMode'
          render={({ field }) => (
            <SettingsSwitchItem>
              <SettingsSwitchContent>
                <FormLabel>{t('Test Mode')}</FormLabel>
                <FormDescription>
                  {t('Enable test mode for Creem payments')}
                </FormDescription>
              </SettingsSwitchContent>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </SettingsSwitchItem>
          )}
        />

        <FormField
          control={form.control}
          name='CreemProducts'
          render={({ field }) => (
            <FormItem>
              <div className='mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <FormLabel>{t('Products')}</FormLabel>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    setCreemProductsVisualMode(!creemProductsVisualMode)
                  }
                  className='w-full sm:w-auto'
                >
                  {creemProductsVisualMode ? (
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
                {creemProductsVisualMode ? (
                  <CreemProductsVisualEditor
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
                    placeholder='[{"name":"Basic","productId":"prod_xxx","price":10,"quota":500000,"currency":"USD"}]'
                    heightClassName='h-40 min-h-40 max-h-40'
                    aria-invalid={Boolean(form.formState.errors.CreemProducts)}
                  />
                )}
              </FormControl>
              <FormDescription>
                {t('Configure Creem products. Provide a JSON array.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </TabsContent>
  )
}
