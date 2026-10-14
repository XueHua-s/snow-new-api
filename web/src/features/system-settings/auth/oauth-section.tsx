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

import { Form } from '@/components/ui/form'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { FormDirtyIndicator } from '../components/form-dirty-indicator'
import { FormNavigationGuard } from '../components/form-navigation-guard'
import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { DiscordOAuthSettings } from './discord-oauth-settings'
import { GithubOAuthSettings } from './github-oauth-settings'
import { LinuxdoOAuthSettings } from './linuxdo-oauth-settings'
import { OidcOAuthSettings } from './oidc-oauth-settings'
import { TelegramOAuthSettings } from './telegram-oauth-settings'
import { type OAuthSectionProps, useOAuthSettings } from './use-o-auth-settings'
import { WechatOAuthSettings } from './wechat-oauth-settings'

export function OAuthSection(props: OAuthSectionProps) {
  const { t } = useTranslation()
  const {
    updateOption,
    activeTab,
    setActiveTab,
    siteUrl,
    githubCallbackUrl,
    discordCallbackUrl,
    oidcCallbackUrl,
    linuxDOCallbackUrl,
    form,
    onSubmit,
    handleReset,
  } = useOAuthSettings(props)
  return (
    <>
      <FormNavigationGuard when={form.formState.isDirty} />

      <SettingsSection title={t('OAuth Integrations')}>
        <Form {...form}>
          <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
            <SettingsPageFormActions
              onSave={form.handleSubmit(onSubmit)}
              onReset={handleReset}
              isSaving={updateOption.isPending}
              isResetDisabled={!form.formState.isDirty}
            />
            <FormDirtyIndicator isDirty={form.formState.isDirty} />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className='grid w-full grid-cols-6'>
                <TabsTrigger value='github'>{t('GitHub')}</TabsTrigger>
                <TabsTrigger value='discord'>{t('Discord')}</TabsTrigger>
                <TabsTrigger value='oidc'>{t('OIDC')}</TabsTrigger>
                <TabsTrigger value='telegram'>{t('Telegram')}</TabsTrigger>
                <TabsTrigger value='linuxdo'>{t('LinuxDO')}</TabsTrigger>
                <TabsTrigger value='wechat'>{t('WeChat')}</TabsTrigger>
              </TabsList>

              <GithubOAuthSettings
                siteUrl={siteUrl}
                githubCallbackUrl={githubCallbackUrl}
                form={form}
              />

              <DiscordOAuthSettings
                siteUrl={siteUrl}
                discordCallbackUrl={discordCallbackUrl}
                form={form}
              />

              <OidcOAuthSettings
                siteUrl={siteUrl}
                oidcCallbackUrl={oidcCallbackUrl}
                form={form}
              />

              <TelegramOAuthSettings form={form} />

              <LinuxdoOAuthSettings
                linuxDOCallbackUrl={linuxDOCallbackUrl}
                form={form}
              />

              <WechatOAuthSettings form={form} />
            </Tabs>
          </SettingsForm>
        </Form>
      </SettingsSection>
    </>
  )
}
