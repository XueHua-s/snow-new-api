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
import { Switch } from '@/components/ui/switch'
import { TabsContent } from '@/components/ui/tabs'

import {
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { oauthTabContentClassName } from './oauth-layout'
import { OAuthSetupGuide } from './oauth-setup-guide'
import type { useOAuthSettings } from './use-o-auth-settings'

export function DiscordOAuthSettings({
  siteUrl,
  discordCallbackUrl,
  form,
}: {
  siteUrl: ReturnType<typeof useOAuthSettings>['siteUrl']
  discordCallbackUrl: ReturnType<typeof useOAuthSettings>['discordCallbackUrl']
  form: ReturnType<typeof useOAuthSettings>['form']
}) {
  const { t } = useTranslation()
  return (
    <TabsContent value='discord' className={oauthTabContentClassName}>
      <OAuthSetupGuide
        title={t('Setup guide')}
        description={t(
          'Set these values in the provider application before enabling login.'
        )}
        rows={[
          {
            label: t('Homepage URL'),
            value: siteUrl,
            copyLabel: t('Copy homepage URL'),
          },
          {
            label: t('Authorization callback URL'),
            value: discordCallbackUrl,
            copyLabel: t('Copy callback URL'),
          },
        ]}
      />

      <FormField
        control={form.control}
        name='discord.enabled'
        render={({ field }) => (
          <SettingsSwitchItem>
            <SettingsSwitchContent>
              <FormLabel>{t('Enable Discord OAuth')}</FormLabel>
              <FormDescription>
                {t('Allow users to sign in with Discord')}
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
        name='discord.client_id'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Client ID')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('Your Discord OAuth Client ID')}
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
        name='discord.client_secret'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Client Secret')}</FormLabel>
            <FormControl>
              <Input
                type='password'
                placeholder={t('Your Discord OAuth Client Secret')}
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
    </TabsContent>
  )
}
