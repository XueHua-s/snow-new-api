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
import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { useUpdateOption } from '../hooks/use-update-option'
import {
  buildOAuthCallbackUrl,
  resolveOAuthSiteUrl,
} from './oauth-callback-url'

/**
 * react-hook-form 7 treats dotted `name` strings as nested paths. To keep
 * form state, schema validation, and dirty tracking aligned, the
 * `discord.*` and `oidc.*` fields are modeled as nested objects here and
 * flattened back to dotted server keys only when persisting.
 */
const oauthSchema = z.object({
  GitHubOAuthEnabled: z.boolean(),
  GitHubClientId: z.string(),
  GitHubClientSecret: z.string(),
  discord: z.object({
    enabled: z.boolean(),
    client_id: z.string(),
    client_secret: z.string(),
  }),
  oidc: z.object({
    enabled: z.boolean(),
    display_name: z.string(),
    client_id: z.string(),
    client_secret: z.string(),
    well_known: z.string(),
    authorization_endpoint: z.string(),
    token_endpoint: z.string(),
    user_info_endpoint: z.string(),
  }),
  TelegramOAuthEnabled: z.boolean(),
  TelegramBotToken: z.string(),
  TelegramBotName: z.string(),
  LinuxDOOAuthEnabled: z.boolean(),
  LinuxDOClientId: z.string(),
  LinuxDOClientSecret: z.string(),
  LinuxDOMinimumTrustLevel: z.string(),
  WeChatAuthEnabled: z.boolean(),
  WeChatServerAddress: z.string(),
  WeChatServerToken: z.string(),
  WeChatAccountQRCodeImageURL: z.string(),
})

type OAuthFormValues = z.infer<typeof oauthSchema>

type FlatOAuthDefaults = {
  GitHubOAuthEnabled: boolean
  GitHubClientId: string
  GitHubClientSecret: string
  'discord.enabled': boolean
  'discord.client_id': string
  'discord.client_secret': string
  'oidc.enabled': boolean
  'oidc.display_name': string
  'oidc.client_id': string
  'oidc.client_secret': string
  'oidc.well_known': string
  'oidc.authorization_endpoint': string
  'oidc.token_endpoint': string
  'oidc.user_info_endpoint': string
  TelegramOAuthEnabled: boolean
  TelegramBotToken: string
  TelegramBotName: string
  LinuxDOOAuthEnabled: boolean
  LinuxDOClientId: string
  LinuxDOClientSecret: string
  LinuxDOMinimumTrustLevel: string
  WeChatAuthEnabled: boolean
  WeChatServerAddress: string
  WeChatServerToken: string
  WeChatAccountQRCodeImageURL: string
}

const buildFormDefaults = (defaults: FlatOAuthDefaults): OAuthFormValues => ({
  GitHubOAuthEnabled: defaults.GitHubOAuthEnabled,
  GitHubClientId: defaults.GitHubClientId ?? '',
  GitHubClientSecret: defaults.GitHubClientSecret ?? '',
  discord: {
    enabled: defaults['discord.enabled'],
    client_id: defaults['discord.client_id'] ?? '',
    client_secret: defaults['discord.client_secret'] ?? '',
  },
  oidc: {
    enabled: defaults['oidc.enabled'],
    display_name: defaults['oidc.display_name'] ?? '',
    client_id: defaults['oidc.client_id'] ?? '',
    client_secret: defaults['oidc.client_secret'] ?? '',
    well_known: defaults['oidc.well_known'] ?? '',
    authorization_endpoint: defaults['oidc.authorization_endpoint'] ?? '',
    token_endpoint: defaults['oidc.token_endpoint'] ?? '',
    user_info_endpoint: defaults['oidc.user_info_endpoint'] ?? '',
  },
  TelegramOAuthEnabled: defaults.TelegramOAuthEnabled,
  TelegramBotToken: defaults.TelegramBotToken ?? '',
  TelegramBotName: defaults.TelegramBotName ?? '',
  LinuxDOOAuthEnabled: defaults.LinuxDOOAuthEnabled,
  LinuxDOClientId: defaults.LinuxDOClientId ?? '',
  LinuxDOClientSecret: defaults.LinuxDOClientSecret ?? '',
  LinuxDOMinimumTrustLevel: defaults.LinuxDOMinimumTrustLevel ?? '',
  WeChatAuthEnabled: defaults.WeChatAuthEnabled,
  WeChatServerAddress: defaults.WeChatServerAddress ?? '',
  WeChatServerToken: defaults.WeChatServerToken ?? '',
  WeChatAccountQRCodeImageURL: defaults.WeChatAccountQRCodeImageURL ?? '',
})

const normalizeFormValues = (values: OAuthFormValues): FlatOAuthDefaults => ({
  GitHubOAuthEnabled: values.GitHubOAuthEnabled,
  GitHubClientId: values.GitHubClientId,
  GitHubClientSecret: values.GitHubClientSecret,
  'discord.enabled': values.discord.enabled,
  'discord.client_id': values.discord.client_id,
  'discord.client_secret': values.discord.client_secret,
  'oidc.enabled': values.oidc.enabled,
  'oidc.display_name': values.oidc.display_name,
  'oidc.client_id': values.oidc.client_id,
  'oidc.client_secret': values.oidc.client_secret,
  'oidc.well_known': values.oidc.well_known,
  'oidc.authorization_endpoint': values.oidc.authorization_endpoint,
  'oidc.token_endpoint': values.oidc.token_endpoint,
  'oidc.user_info_endpoint': values.oidc.user_info_endpoint,
  TelegramOAuthEnabled: values.TelegramOAuthEnabled,
  TelegramBotToken: values.TelegramBotToken,
  TelegramBotName: values.TelegramBotName,
  LinuxDOOAuthEnabled: values.LinuxDOOAuthEnabled,
  LinuxDOClientId: values.LinuxDOClientId,
  LinuxDOClientSecret: values.LinuxDOClientSecret,
  LinuxDOMinimumTrustLevel: values.LinuxDOMinimumTrustLevel,
  WeChatAuthEnabled: values.WeChatAuthEnabled,
  WeChatServerAddress: values.WeChatServerAddress,
  WeChatServerToken: values.WeChatServerToken,
  WeChatAccountQRCodeImageURL: values.WeChatAccountQRCodeImageURL,
})

export type OAuthSectionProps = {
  defaultValues: FlatOAuthDefaults
  serverAddress: string
}

export function useOAuthSettings(props: OAuthSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [activeTab, setActiveTab] = useState('github')
  const siteUrl = resolveOAuthSiteUrl(props.serverAddress, t('Site URL'))
  const githubCallbackUrl = buildOAuthCallbackUrl(
    props.serverAddress,
    'github',
    t('Site URL')
  )
  const discordCallbackUrl = buildOAuthCallbackUrl(
    props.serverAddress,
    'discord',
    t('Site URL')
  )
  const oidcCallbackUrl = buildOAuthCallbackUrl(
    props.serverAddress,
    'oidc',
    t('Site URL')
  )
  const linuxDOCallbackUrl = buildOAuthCallbackUrl(
    props.serverAddress,
    'linuxdo',
    t('Site URL')
  )

  const formDefaults = useMemo(
    () => buildFormDefaults(props.defaultValues),
    [props.defaultValues]
  )

  const form = useForm<OAuthFormValues>({
    resolver: zodResolver(oauthSchema),
    defaultValues: formDefaults,
  })

  const baselineRef = useRef<FlatOAuthDefaults>(props.defaultValues)
  const baselineSerializedRef = useRef<string>(
    JSON.stringify(props.defaultValues)
  )

  useEffect(() => {
    const serialized = JSON.stringify(props.defaultValues)
    if (serialized === baselineSerializedRef.current) return
    baselineRef.current = props.defaultValues
    baselineSerializedRef.current = serialized
    form.reset(buildFormDefaults(props.defaultValues))
  }, [props.defaultValues, form])

  const onSubmit = async (values: OAuthFormValues) => {
    let finalValues = values

    if (values.oidc.well_known && values.oidc.well_known.trim() !== '') {
      const wellKnown = values.oidc.well_known.trim()
      if (
        !wellKnown.startsWith('http://') &&
        !wellKnown.startsWith('https://')
      ) {
        toast.error(t('Well-Known URL must start with http:// or https://'))
        return
      }

      try {
        const res = await axios.create().get(wellKnown)
        const authEndpoint = res.data['authorization_endpoint'] || ''
        const tokenEndpoint = res.data['token_endpoint'] || ''
        const userInfoEndpoint = res.data['userinfo_endpoint'] || ''

        finalValues = {
          ...values,
          oidc: {
            ...values.oidc,
            authorization_endpoint: authEndpoint,
            token_endpoint: tokenEndpoint,
            user_info_endpoint: userInfoEndpoint,
          },
        }

        form.setValue('oidc.authorization_endpoint', authEndpoint)
        form.setValue('oidc.token_endpoint', tokenEndpoint)
        form.setValue('oidc.user_info_endpoint', userInfoEndpoint)

        toast.success(t('OIDC configuration fetched successfully'))
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err)
        toast.error(
          t(
            'Failed to fetch OIDC configuration. Please check the URL and network status'
          )
        )
        return
      }
    }

    const normalized = normalizeFormValues(finalValues)
    const changedKeys = (
      Object.keys(normalized) as Array<keyof FlatOAuthDefaults>
    ).filter((key) => normalized[key] !== baselineRef.current[key])

    if (changedKeys.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const key of changedKeys) {
      await updateOption.mutateAsync({
        key,
        value: normalized[key],
      })
    }

    baselineRef.current = normalized
    baselineSerializedRef.current = JSON.stringify(normalized)
    form.reset(buildFormDefaults(normalized))
  }

  const handleReset = () => {
    form.reset(buildFormDefaults(baselineRef.current))
    toast.success(t('Form reset to saved values'))
  }

  return {
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
  }
}
