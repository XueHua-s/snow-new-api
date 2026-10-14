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
import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { sideDrawerSectionClassName } from '@/components/drawer-layout'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'

import {
  CLAUDE_FIELD_PASSTHROUGH_TYPES,
  OPENAI_FIELD_PASSTHROUGH_TYPES,
} from '../../constants'
import { CardHeading } from './channel-editor-controls'
import { ADVANCED_SETTINGS_SECTION_IDS } from './channel-editor-state'
import { configuredAdvancedSectionClassName } from './channel-section-style'
import type { useChannelEditor } from './use-channel-editor'

export function ChannelPassthroughFields({
  fieldPassthroughConfigured,
  sensitiveLocked,
  form,
  currentType,
}: {
  fieldPassthroughConfigured: ReturnType<
    typeof useChannelEditor
  >['fieldPassthroughConfigured']
  sensitiveLocked: ReturnType<typeof useChannelEditor>['sensitiveLocked']
  form: ReturnType<typeof useChannelEditor>['form']
  currentType: ReturnType<typeof useChannelEditor>['currentType']
}) {
  const { t } = useTranslation()
  return (
    <div
      id={ADVANCED_SETTINGS_SECTION_IDS.fieldPassthrough}
      className={sideDrawerSectionClassName(
        configuredAdvancedSectionClassName(
          'scroll-mt-4',
          fieldPassthroughConfigured
        )
      )}
    >
      <CardHeading
        title={t('Field passthrough controls')}
        icon={<SlidersHorizontal className='h-4 w-4' />}
        iconTone='chart-4'
      />
      <fieldset disabled={sensitiveLocked} className='disabled:opacity-60'>
        <div className='divide-border space-y-0 divide-y border-y'>
          <FormField
            control={form.control}
            name='allow_service_tier'
            render={({ field }) => (
              <FormItem className='flex items-center justify-between gap-3 px-4 py-3'>
                <div className='space-y-0.5'>
                  <FormLabel className='text-sm'>
                    {t('Allow service_tier passthrough')}
                  </FormLabel>
                  <FormDescription>
                    {t('Pass through the service_tier field')}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {OPENAI_FIELD_PASSTHROUGH_TYPES.has(currentType) && (
            <>
              <FormField
                control={form.control}
                name='disable_store'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between gap-3 px-4 py-3'>
                    <div className='space-y-0.5'>
                      <FormLabel className='text-sm'>
                        {t('Disable store passthrough')}
                      </FormLabel>
                      <FormDescription>
                        {t('When enabled, the store field will be blocked')}
                      </FormDescription>
                    </div>
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
                name='allow_safety_identifier'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between gap-3 px-4 py-3'>
                    <div className='space-y-0.5'>
                      <FormLabel className='text-sm'>
                        {t('Allow safety_identifier passthrough')}
                      </FormLabel>
                      <FormDescription>
                        {t('Pass through the safety_identifier field')}
                      </FormDescription>
                    </div>
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
                name='allow_include_obfuscation'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between gap-3 px-4 py-3'>
                    <div className='space-y-0.5'>
                      <FormLabel className='text-sm'>
                        {t('Allow include usage obfuscation passthrough')}
                      </FormLabel>
                      <FormDescription>
                        {t(
                          'Pass through the include field for usage obfuscation'
                        )}
                      </FormDescription>
                    </div>
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
                name='allow_inference_geo'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between gap-3 px-4 py-3'>
                    <div className='space-y-0.5'>
                      <FormLabel className='text-sm'>
                        {t('Allow inference geography passthrough')}
                      </FormLabel>
                      <FormDescription>
                        {t(
                          'Pass through the inference_geo field for geographic routing'
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </>
          )}

          {CLAUDE_FIELD_PASSTHROUGH_TYPES.has(currentType) && (
            <>
              {(currentType === 14 || currentType === 61) && (
                <FormField
                  control={form.control}
                  name='allow_inference_geo'
                  render={({ field }) => (
                    <FormItem className='flex items-center justify-between gap-3 px-4 py-3'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-sm'>
                          {t('Allow inference_geo passthrough')}
                        </FormLabel>
                        <FormDescription>
                          {t(
                            'Pass through the inference_geo field for Claude data residency region control'
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='allow_speed'
                render={({ field }) => (
                  <FormItem className='flex items-center justify-between gap-3 px-4 py-3'>
                    <div className='space-y-0.5'>
                      <FormLabel className='text-sm'>
                        {t('Allow speed passthrough')}
                      </FormLabel>
                      <FormDescription>
                        {t(
                          'Pass through the speed field for Claude inference speed mode control'
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {(currentType === 14 || currentType === 61) && (
                <FormField
                  control={form.control}
                  name='claude_beta_query'
                  render={({ field }) => (
                    <FormItem className='flex items-center justify-between gap-3 px-4 py-3'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-sm'>
                          {t('Allow Claude beta query passthrough')}
                        </FormLabel>
                        <FormDescription>
                          {t(
                            'Pass through the anthropic-beta header for beta features'
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
            </>
          )}
        </div>
      </fieldset>
    </div>
  )
}
