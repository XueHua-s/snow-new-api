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

import { sideDrawerSectionClassName } from '@/components/drawer-layout'
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

import { CardHeading } from './channel-editor-controls'
import {
  ADVANCED_SETTINGS_SECTION_IDS,
  formatUnixTime,
} from './channel-editor-state'
import { configuredAdvancedSectionClassName } from './channel-section-style'
import type { useChannelEditor } from './use-channel-editor'

export function ChannelModelDetectionFields({
  upstreamModelDetectionConfigured,
  sensitiveLocked,
  form,
  upstreamModelUpdateCheckEnabled,
  upstreamUpdateMeta,
  upstreamDetectedModelsPreview,
  upstreamDetectedModelsOmittedCount,
}: {
  upstreamModelDetectionConfigured: ReturnType<
    typeof useChannelEditor
  >['upstreamModelDetectionConfigured']
  sensitiveLocked: ReturnType<typeof useChannelEditor>['sensitiveLocked']
  form: ReturnType<typeof useChannelEditor>['form']
  upstreamModelUpdateCheckEnabled: ReturnType<
    typeof useChannelEditor
  >['upstreamModelUpdateCheckEnabled']
  upstreamUpdateMeta: ReturnType<typeof useChannelEditor>['upstreamUpdateMeta']
  upstreamDetectedModelsPreview: ReturnType<
    typeof useChannelEditor
  >['upstreamDetectedModelsPreview']
  upstreamDetectedModelsOmittedCount: ReturnType<
    typeof useChannelEditor
  >['upstreamDetectedModelsOmittedCount']
}) {
  const { t } = useTranslation()
  return (
    <div
      id={ADVANCED_SETTINGS_SECTION_IDS.upstreamModelDetection}
      className={sideDrawerSectionClassName(
        configuredAdvancedSectionClassName(
          'scroll-mt-4',
          upstreamModelDetectionConfigured
        )
      )}
    >
      <CardHeading
        title={t('Upstream Model Detection Settings')}
        icon={<RefreshCw className='h-4 w-4' />}
        iconTone='info'
      />
      <fieldset
        disabled={sensitiveLocked}
        className='space-y-4 disabled:opacity-60'
      >
        <div className='divide-border space-y-0 divide-y border-y'>
          <FormField
            control={form.control}
            name='upstream_model_update_check_enabled'
            render={({ field }) => (
              <FormItem className='flex items-center justify-between px-4 py-3'>
                <div className='space-y-0.5'>
                  <FormLabel>{t('Upstream Model Update Check')}</FormLabel>
                  <FormDescription>
                    {t('Periodically check for upstream model changes')}
                  </FormDescription>
                  <FormMessage />
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
            name='upstream_model_update_auto_sync_enabled'
            render={({ field }) => (
              <FormItem className='flex items-center justify-between px-4 py-3'>
                <div className='space-y-0.5'>
                  <FormLabel>{t('Auto Sync Upstream Models')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Automatically sync model list when upstream changes are detected'
                    )}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    disabled={!upstreamModelUpdateCheckEnabled}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name='upstream_model_update_ignored_models'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Ignored upstream models')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t(
                    'e.g., gpt-4.1-nano,regex:^claude-.*$,regex:^sora-.*$'
                  )}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t(
                  'Comma-separated exact model names. Prefix with regex: to ignore by regular expression.'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className='text-muted-foreground space-y-2 border-t pt-3 text-xs'>
          <div>
            <span className='text-foreground font-medium'>
              {t('Last check time')}:
            </span>{' '}
            {formatUnixTime(upstreamUpdateMeta.lastCheckTime)}
          </div>
          <div>
            <span className='text-foreground font-medium'>
              {t('Last detected addable models')}:
            </span>{' '}
            {upstreamUpdateMeta.detectedModels.length === 0 ? (
              t('None')
            ) : (
              <>
                <span className='break-all'>
                  {upstreamDetectedModelsPreview.join(', ')}
                </span>
                {upstreamDetectedModelsOmittedCount > 0 && (
                  <span className='ml-1'>
                    {t('({{total}} total, {{omit}} omitted)', {
                      total: upstreamUpdateMeta.detectedModels.length,
                      omit: upstreamDetectedModelsOmittedCount,
                    })}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </fieldset>
    </div>
  )
}
