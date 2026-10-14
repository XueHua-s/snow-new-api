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
import type { useOAuthSettings } from './use-o-auth-settings'

export function WechatOAuthSettings({
  form,
}: {
  form: ReturnType<typeof useOAuthSettings>['form']
}) {
  const { t } = useTranslation()
  return (
    <TabsContent value='wechat' className={oauthTabContentClassName}>
      <FormField
        control={form.control}
        name='WeChatAuthEnabled'
        render={({ field }) => (
          <SettingsSwitchItem>
            <SettingsSwitchContent>
              <FormLabel>{t('Enable WeChat Auth')}</FormLabel>
              <FormDescription>
                {t('Allow users to sign in with WeChat')}
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
        name='WeChatServerAddress'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Server Address')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('https://wechat-server.example.com')}
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
        name='WeChatServerToken'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Server Token')}</FormLabel>
            <FormControl>
              <Input
                type='password'
                placeholder={t('Server Token')}
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
        name='WeChatAccountQRCodeImageURL'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('QR Code Image URL')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('https://example.com/qr-code.png')}
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
