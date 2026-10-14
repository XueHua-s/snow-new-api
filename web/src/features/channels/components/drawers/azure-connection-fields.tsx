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

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

import type { useChannelEditor } from './use-channel-editor'

export function AzureConnectionFields({
  currentType,
  form,
}: {
  currentType: ReturnType<typeof useChannelEditor>['currentType']
  form: ReturnType<typeof useChannelEditor>['form']
}) {
  const { t } = useTranslation()
  return (
    currentType === 3 && (
      <>
        <FormField
          control={form.control}
          name='base_url'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('AZURE_OPENAI_ENDPOINT *')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t(
                    'e.g., https://docs-test-001.openai.azure.com'
                  )}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('Your Azure OpenAI endpoint URL')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='other'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Default API Version *')}</FormLabel>
              <FormControl>
                <Input placeholder={t('e.g., 2025-04-01-preview')} {...field} />
              </FormControl>
              <FormDescription>
                {t('Default API version for this channel')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='azure_responses_version'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Responses API Version')}</FormLabel>
              <FormControl>
                <Input placeholder={t('e.g., preview')} {...field} />
              </FormControl>
              <FormDescription>
                {t(
                  'Default Responses API version, if empty, will use the API version above'
                )}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    )
  )
}
