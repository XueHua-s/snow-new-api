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
import { ExternalLink } from 'lucide-react'
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
import { TabsContent } from '@/components/ui/tabs'

import {
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { oauthTabContentClassName } from './oauth-layout'
import { OAuthSetupGuide } from './oauth-setup-guide'
import type { useOAuthSettings } from './use-o-auth-settings'

export function LinuxdoOAuthSettings({
  linuxDOCallbackUrl,
  form,
}: {
  linuxDOCallbackUrl: ReturnType<typeof useOAuthSettings>['linuxDOCallbackUrl']
  form: ReturnType<typeof useOAuthSettings>['form']
}) {
  const { t } = useTranslation()
  return (
    <TabsContent value='linuxdo' className={oauthTabContentClassName}>
      <OAuthSetupGuide
        title={t('Setup guide')}
        description={t(
          'Set these values in the provider application before enabling login.'
        )}
        rows={[
          {
            label: t('Authorization callback URL'),
            value: linuxDOCallbackUrl,
            copyLabel: t('Copy callback URL'),
          },
        ]}
      >
        <a
          href='https://connect.linux.do/'
          target='_blank'
          rel='noreferrer'
          className='text-primary inline-flex w-fit items-center gap-1 underline underline-offset-3 hover:no-underline'
        >
          {t('Manage your LinuxDO OAuth app')}
          <ExternalLink className='size-3' aria-hidden='true' />
        </a>
      </OAuthSetupGuide>

      <FormField
        control={form.control}
        name='LinuxDOOAuthEnabled'
        render={({ field }) => (
          <SettingsSwitchItem>
            <SettingsSwitchContent>
              <FormLabel>{t('Enable LinuxDO OAuth')}</FormLabel>
              <FormDescription>
                {t('Allow users to sign in with LinuxDO')}
              </FormDescription>
            </SettingsSwitchContent>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </SettingsSwitchItem>
        )}
      />

      <FormField
        control={form.control}
        name='LinuxDOClientId'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Client ID')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('LinuxDO Client ID')}
                autoComplete='off'
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value)}
                name={field.name}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='LinuxDOClientSecret'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Client Secret')}</FormLabel>
            <FormControl>
              <Input
                type='password'
                placeholder={t('LinuxDO Client Secret')}
                autoComplete='new-password'
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value)}
                name={field.name}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='LinuxDOMinimumTrustLevel'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Minimum Trust Level')}</FormLabel>
            <FormControl>
              <Input
                placeholder='0'
                autoComplete='off'
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value)}
                name={field.name}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            </FormControl>
            <FormDescription>
              {t('Minimum LinuxDO trust level required')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </TabsContent>
  )
}
