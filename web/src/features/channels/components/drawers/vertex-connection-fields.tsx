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
import { toast } from 'sonner'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import type { useChannelEditor } from './use-channel-editor'

export function VertexConnectionFields({
  currentType,
  form,
  vertexKeyType,
  isBatchMode,
}: {
  currentType: ReturnType<typeof useChannelEditor>['currentType']
  form: ReturnType<typeof useChannelEditor>['form']
  vertexKeyType: ReturnType<typeof useChannelEditor>['vertexKeyType']
  isBatchMode: ReturnType<typeof useChannelEditor>['isBatchMode']
}) {
  const { t } = useTranslation()
  return (
    currentType === 41 && (
      <>
        <FormField
          control={form.control}
          name='vertex_key_type'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Vertex AI Key Format')}</FormLabel>
              <Select
                items={[
                  { value: 'json', label: t('JSON') },
                  {
                    value: 'api_key',
                    label: t('API Key'),
                  },
                ]}
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
                    <SelectItem value='json'>{t('JSON')}</SelectItem>
                    <SelectItem value='api_key'>{t('API Key')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormDescription>
                {field.value === 'json'
                  ? t('JSON format supports service account JSON files')
                  : t('API Key mode (does not support batch creation)')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {vertexKeyType === 'json' && (
          <FormItem>
            <FormLabel>{t('Service account JSON file(s)')}</FormLabel>
            <FormControl>
              <Input
                type='file'
                accept='.json,application/json'
                multiple={isBatchMode}
                onChange={async (e) => {
                  const fileList = e.target.files
                  const files = fileList ? [...fileList] : []
                  // allow re-selecting the same file
                  e.target.value = ''

                  if (files.length === 0) {
                    toast.info(t('Please upload key file(s)'))
                    return
                  }

                  const keys: unknown[] = []
                  for (const file of files) {
                    try {
                      const txt = await file.text()
                      keys.push(JSON.parse(txt))
                    } catch {
                      toast.error(
                        t('Failed to parse JSON file: {{name}}', {
                          name: file.name,
                        })
                      )
                      return
                    }
                  }

                  if (keys.length === 0) {
                    toast.info(t('Please upload key file(s)'))
                    return
                  }

                  const keyValue = isBatchMode
                    ? JSON.stringify(keys)
                    : JSON.stringify(keys[0])

                  form.setValue('key', keyValue, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })

                  toast.success(
                    t('Parsed {{count}} service account file(s)', {
                      count: keys.length,
                    })
                  )
                }}
              />
            </FormControl>
            <FormDescription>
              {isBatchMode
                ? t('Upload multiple JSON files in batch modes')
                : t('Upload a single service account JSON file')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
        <FormField
          control={form.control}
          name='other'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Deployment Region *')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t(
                    'e.g., us-central1 or JSON format for model-specific regions'
                  )}
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('Enter deployment region or JSON mapping:')} {'{'}
                {t(
                  '"default": "us-central1", "claude-3-5-sonnet-20240620": "europe-west1"'
                )}
                {'}'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    )
  )
}
