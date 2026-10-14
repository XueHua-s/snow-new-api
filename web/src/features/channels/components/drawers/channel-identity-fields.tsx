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
import { useTranslation } from 'react-i18next'

import { sideDrawerSwitchItemClassName } from '@/components/drawer-layout'
import { Combobox } from '@/components/ui/combobox'
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
import { ChannelTypeLogo } from './channel-editor-controls'
import { CHANNEL_EDITOR_SECTION_IDS } from './channel-editor-state'
import { ChannelBasicSection } from './sections'
import type { useChannelEditor } from './use-channel-editor'

export function ChannelIdentityFields({
  sensitiveLocked,
  form,
  channelTypeOptions,
  isEditing,
  currentType,
}: {
  sensitiveLocked: ReturnType<typeof useChannelEditor>['sensitiveLocked']
  form: ReturnType<typeof useChannelEditor>['form']
  channelTypeOptions: ReturnType<typeof useChannelEditor>['channelTypeOptions']
  isEditing: ReturnType<typeof useChannelEditor>['isEditing']
  currentType: ReturnType<typeof useChannelEditor>['currentType']
}) {
  const { t } = useTranslation()
  return (
    <div id={CHANNEL_EDITOR_SECTION_IDS.identity} className='scroll-mt-4'>
      <ChannelBasicSection>
        <div className='grid gap-4 sm:grid-cols-2'>
          <fieldset
            disabled={sensitiveLocked}
            className='min-w-0 disabled:opacity-60'
          >
            <FormField
              control={form.control}
              name='type'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Type *')}</FormLabel>
                  <FormControl>
                    <div className='relative'>
                      <span className='pointer-events-none absolute top-1/2 left-3 z-10 flex -translate-y-1/2'>
                        <ChannelTypeLogo type={Number(field.value)} size={18} />
                      </span>
                      <Combobox
                        options={channelTypeOptions}
                        value={String(field.value)}
                        onValueChange={(value) => {
                          const nextType = Number(value)
                          if (Number.isInteger(nextType) && nextType > 0) {
                            field.onChange(nextType)
                          }
                        }}
                        placeholder={t('Select channel type')}
                        searchPlaceholder={t('Search channel type...')}
                        emptyText={t('No channel type found.')}
                        className='pl-10'
                        allowCustomValue
                        openOnFocus={false}
                      />
                    </div>
                  </FormControl>
                  {sensitiveLocked && (
                    <FormDescription>
                      {t('No permission to perform this action')}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>

          <FormField
            control={form.control}
            name='name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Name *')}</FormLabel>
                <FormControl>
                  <Input placeholder={t(FIELD_PLACEHOLDERS.NAME)} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {!isEditing && (
          <FormField
            control={form.control}
            name='status'
            render={({ field }) => (
              <FormItem className={sideDrawerSwitchItemClassName()}>
                <div className='flex flex-col gap-0.5'>
                  <FormLabel>{t('Enabled')}</FormLabel>
                  <FormDescription className='text-xs'>
                    {t('Enable or disable this channel')}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value === 1}
                    onCheckedChange={(checked) =>
                      field.onChange(checked ? 1 : 2)
                    }
                  />
                </FormControl>
              </FormItem>
            )}
          />
        )}

        {currentType === 1 && (
          <fieldset disabled={sensitiveLocked} className='disabled:opacity-60'>
            <FormField
              control={form.control}
              name='openai_organization'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('OpenAI Organization')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('org-...')} {...field} />
                  </FormControl>
                  <FormDescription>
                    {sensitiveLocked
                      ? t('No permission to perform this action')
                      : t(FIELD_DESCRIPTIONS.OPENAI_ORG)}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
        )}
      </ChannelBasicSection>
    </div>
  )
}
