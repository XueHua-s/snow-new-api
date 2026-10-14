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

import {
  ACCESS_DENIED_MESSAGE_TEMPLATES,
  ACCESS_POLICY_TEMPLATES,
} from './access-policy-templates'
import type { useOAuthProviderForm } from './use-o-auth-provider-form'

export function ProviderAccessPolicy({
  form,
}: {
  form: ReturnType<typeof useOAuthProviderForm>['form']
}) {
  const { t } = useTranslation()
  return (
    <div className='space-y-4'>
      <h4 className='text-sm font-medium'>{t('Advanced')}</h4>

      <FormField
        control={form.control}
        name='access_policy'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Access Policy (JSON)')}</FormLabel>
            <FormDescription>
              {t(
                'Evaluate fields from the provider user info response. Conditions and nested groups use and/or logic.'
              )}
            </FormDescription>
            <FormControl>
              <JsonCodeEditor
                value={field.value || ''}
                onChange={field.onChange}
                name={field.name}
                onBlur={field.onBlur}
                textareaRef={field.ref}
                placeholder={t(
                  'Optional JSON policy to restrict access based on user info fields'
                )}
                heightClassName='h-40 min-h-40 max-h-40'
              />
            </FormControl>
            <FormDescription>
              {t(
                'Supported operators: eq, ne, gt, gte, lt, lte, in, not_in, contains, not_contains, exists, not_exists. Leave empty to allow all users.'
              )}
            </FormDescription>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                size='xs'
                onClick={() =>
                  form.setValue(
                    'access_policy',
                    ACCESS_POLICY_TEMPLATES.levelAndActive,
                    { shouldDirty: true, shouldValidate: true }
                  )
                }
              >
                {t('Fill template: level and active')}
              </Button>
              <Button
                type='button'
                variant='outline'
                size='xs'
                onClick={() =>
                  form.setValue(
                    'access_policy',
                    ACCESS_POLICY_TEMPLATES.orgOrRole,
                    { shouldDirty: true, shouldValidate: true }
                  )
                }
              >
                {t('Fill template: organization or role')}
              </Button>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='access_denied_message'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Access Denied Message')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t(
                  'e.g. Requires level {{required}}; your current level is {{current}}'
                )}
                {...field}
              />
            </FormControl>
            <FormDescription>
              {t(
                'Available variables: {{provider}}, {{field}}, {{op}}, {{required}}, {{current}}, and paths such as {{current.roles}}.'
              )}
            </FormDescription>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                size='xs'
                onClick={() =>
                  form.setValue(
                    'access_denied_message',
                    ACCESS_DENIED_MESSAGE_TEMPLATES.level,
                    { shouldDirty: true }
                  )
                }
              >
                {t('Fill template: level message')}
              </Button>
              <Button
                type='button'
                variant='outline'
                size='xs'
                onClick={() =>
                  form.setValue(
                    'access_denied_message',
                    ACCESS_DENIED_MESSAGE_TEMPLATES.org,
                    { shouldDirty: true }
                  )
                }
              >
                {t('Fill template: organization message')}
              </Button>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
