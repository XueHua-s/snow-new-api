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

import { SideDrawerSection } from '@/components/drawer-layout'
import { JsonCodeEditor } from '@/components/json-code-editor'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

import type { useDeploymentForm } from './use-deployment-form'

export function DeploymentContainerFields({
  form,
}: {
  form: ReturnType<typeof useDeploymentForm>['form']
}) {
  const { t } = useTranslation()
  return (
    <SideDrawerSection>
      <h3 className='text-sm font-medium'>{t('Advanced Configuration')}</h3>
      <p className='text-muted-foreground text-xs'>
        {t('Optional settings for advanced container configuration.')}
      </p>

      <div className='flex flex-col gap-4'>
        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField
            control={form.control}
            name='entrypoint'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Entrypoint (space separated)')}</FormLabel>
                <FormControl>
                  <Input placeholder='bash -lc' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='args'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Args (space separated)')}</FormLabel>
                <FormControl>
                  <Input placeholder='--foo bar' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name='env_json'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Environment variables (JSON)')}</FormLabel>
              <FormControl>
                <JsonCodeEditor
                  value={field.value || ''}
                  onChange={field.onChange}
                  name={field.name}
                  onBlur={field.onBlur}
                  textareaRef={field.ref}
                  placeholder='{"KEY":"VALUE"}'
                  heightClassName='h-40 min-h-40 max-h-40'
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='secret_env_json'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Secret environment variables (JSON)')}</FormLabel>
              <FormControl>
                <JsonCodeEditor
                  value={field.value || ''}
                  onChange={field.onChange}
                  name={field.name}
                  onBlur={field.onBlur}
                  textareaRef={field.ref}
                  placeholder='{"SECRET":"VALUE"}'
                  heightClassName='h-40 min-h-40 max-h-40'
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField
            control={form.control}
            name='registry_username'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Registry username')}</FormLabel>
                <FormControl>
                  <Input autoComplete='off' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='registry_secret'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Registry secret')}</FormLabel>
                <FormControl>
                  <Input type='password' autoComplete='off' {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </SideDrawerSection>
  )
}
