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

export function OidcOAuthSettings({
  siteUrl,
  oidcCallbackUrl,
  form,
}: {
  siteUrl: ReturnType<typeof useOAuthSettings>['siteUrl']
  oidcCallbackUrl: ReturnType<typeof useOAuthSettings>['oidcCallbackUrl']
  form: ReturnType<typeof useOAuthSettings>['form']
}) {
  const { t } = useTranslation()
  return (
    <TabsContent value='oidc' className={oauthTabContentClassName}>
      <OAuthSetupGuide
        title={t('Setup guide')}
        description={
          <div className='space-y-1'>
            <p>
              {t(
                'Set these values in the provider application before enabling login.'
              )}
            </p>
            <p>
              {t(
                'OIDC discovery can fill the endpoint fields automatically when the provider supports it.'
              )}
            </p>
          </div>
        }
        rows={[
          {
            label: t('Homepage URL'),
            value: siteUrl,
            copyLabel: t('Copy homepage URL'),
          },
          {
            label: t('Redirect URL'),
            value: oidcCallbackUrl,
            copyLabel: t('Copy redirect URL'),
          },
        ]}
      />

      <FormField
        control={form.control}
        name='oidc.enabled'
        render={({ field }) => (
          <SettingsSwitchItem>
            <SettingsSwitchContent>
              <FormLabel>{t('Enable OIDC')}</FormLabel>
              <FormDescription>
                {t('Allow users to sign in with OpenID Connect')}
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
        name='oidc.display_name'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('OIDC Display Name')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('e.g. Company SSO')}
                autoComplete='off'
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value)}
                name={field.name}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            </FormControl>
            <FormDescription>
              {t('Defaults to "OIDC" if left blank')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='oidc.client_id'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Client ID')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('OIDC Client ID')}
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
        name='oidc.client_secret'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Client Secret')}</FormLabel>
            <FormControl>
              <Input
                type='password'
                placeholder={t('OIDC Client Secret')}
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
        name='oidc.well_known'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Well-Known URL')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t(
                  'https://provider.com/.well-known/openid-configuration'
                )}
                autoComplete='off'
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value)}
                name={field.name}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            </FormControl>
            <FormDescription>
              {t('Auto-discovers endpoints from the provider')}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='oidc.authorization_endpoint'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Authorization Endpoint (Optional)')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('Override auto-discovered endpoint')}
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
        name='oidc.token_endpoint'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Token Endpoint (Optional)')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('Override auto-discovered endpoint')}
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
        name='oidc.user_info_endpoint'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('User Info Endpoint (Optional)')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('Override auto-discovered endpoint')}
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
    </TabsContent>
  )
}
