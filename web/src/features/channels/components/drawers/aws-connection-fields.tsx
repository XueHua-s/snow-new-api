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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { useChannelEditor } from './use-channel-editor'

export function AwsConnectionFields({
  currentType,
  form,
}: {
  currentType: ReturnType<typeof useChannelEditor>['currentType']
  form: ReturnType<typeof useChannelEditor>['form']
}) {
  const { t } = useTranslation()
  return (
    currentType === 33 && (
      <FormField
        control={form.control}
        name='aws_key_type'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('AWS Key Format')}</FormLabel>
            <Select
              items={[
                {
                  value: 'ak_sk',
                  label: t('AccessKey / SecretAccessKey'),
                },
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
                  <SelectValue placeholder={t('Select key format')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value='ak_sk'>
                    {t('AccessKey / SecretAccessKey')}
                  </SelectItem>
                  <SelectItem value='api_key'>{t('API Key')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FormDescription>
              {field.value === 'api_key'
                ? t('API Key mode: use APIKey|Region')
                : t('AK/SK mode: use AccessKey|SecretAccessKey|Region')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    )
  )
}
