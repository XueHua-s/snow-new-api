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
import { Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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

import { FIELD_DESCRIPTIONS, FIELD_PLACEHOLDERS } from '../../constants'
import { SubHeading } from './channel-editor-controls'
import { ADVANCED_SETTINGS_SECTION_IDS } from './channel-editor-state'
import { configuredAdvancedSectionClassName } from './channel-section-style'
import type { useChannelEditor } from './use-channel-editor'

export function ChannelRoutingFields({
  routingStrategyConfigured,
  form,
}: {
  routingStrategyConfigured: ReturnType<
    typeof useChannelEditor
  >['routingStrategyConfigured']
  form: ReturnType<typeof useChannelEditor>['form']
}) {
  const { t } = useTranslation()
  return (
    <div
      id={ADVANCED_SETTINGS_SECTION_IDS.routingStrategy}
      className={configuredAdvancedSectionClassName(
        'flex scroll-mt-4 flex-col gap-4',
        routingStrategyConfigured
      )}
    >
      <SubHeading
        title={t('Routing Strategy')}
        icon={<Route className='h-3.5 w-3.5' />}
        iconTone='info'
      />
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          control={form.control}
          name='priority'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Priority')}</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  placeholder='0'
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormDescription>
                {t(FIELD_DESCRIPTIONS.PRIORITY)}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='weight'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Weight')}</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  placeholder='0'
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormDescription>{t(FIELD_DESCRIPTIONS.WEIGHT)}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name='test_model'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Test Model')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t(FIELD_PLACEHOLDERS.TEST_MODEL)}
                {...field}
              />
            </FormControl>
            <FormDescription>
              {t(FIELD_DESCRIPTIONS.TEST_MODEL)}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='auto_ban'
        render={({ field }) => (
          <FormItem className='flex items-center justify-between'>
            <div className='space-y-0.5'>
              <FormLabel>{t('Auto Ban')}</FormLabel>
              <FormDescription>
                {t(FIELD_DESCRIPTIONS.AUTO_BAN)}
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value === 1}
                onCheckedChange={(checked) => field.onChange(checked ? 1 : 0)}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  )
}
