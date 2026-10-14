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
import { useEffect } from 'react'
import { type Resolver, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { buildOAuthCallbackUrl } from '../../oauth-callback-url'
import {
  useCreateProvider,
  useUpdateProvider,
} from '../hooks/use-custom-oauth-mutations'
import {
  customOAuthFormSchema,
  type CustomOAuthProvider,
  type CustomOAuthFormValues,
} from '../types'

export type ProviderFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider?: CustomOAuthProvider | null
  serverAddress: string
}

export function useOAuthProviderForm(props: ProviderFormDialogProps) {
  const { t } = useTranslation()
  const isEditing = !!props.provider
  const createProvider = useCreateProvider()
  const updateProvider = useUpdateProvider()

  const form = useForm<CustomOAuthFormValues>({
    resolver: zodResolver(
      customOAuthFormSchema
    ) as unknown as Resolver<CustomOAuthFormValues>,
    defaultValues: {
      name: '',
      slug: '',
      icon: '',
      enabled: true,
      client_id: '',
      client_secret: '',
      authorization_endpoint: '',
      token_endpoint: '',
      user_info_endpoint: '',
      scopes: '',
      user_id_field: '',
      username_field: '',
      display_name_field: '',
      email_field: '',
      well_known: '',
      auth_style: 0,
      access_policy: '',
      access_denied_message: '',
    },
  })
  const watchedSlug = useWatch({ control: form.control, name: 'slug' })
  const callbackPath = watchedSlug?.trim() || '{slug}'
  const callbackUrl = buildOAuthCallbackUrl(
    props.serverAddress,
    callbackPath,
    t('Site URL')
  )

  useEffect(() => {
    if (props.open && props.provider) {
      form.reset({
        name: props.provider.name,
        slug: props.provider.slug,
        icon: props.provider.icon || '',
        enabled: props.provider.enabled,
        client_id: props.provider.client_id,
        client_secret: props.provider.client_secret || '',
        authorization_endpoint: props.provider.authorization_endpoint,
        token_endpoint: props.provider.token_endpoint,
        user_info_endpoint: props.provider.user_info_endpoint,
        scopes: props.provider.scopes || '',
        user_id_field: props.provider.user_id_field,
        username_field: props.provider.username_field || '',
        display_name_field: props.provider.display_name_field || '',
        email_field: props.provider.email_field || '',
        well_known: props.provider.well_known || '',
        auth_style: props.provider.auth_style ?? 0,
        access_policy: props.provider.access_policy || '',
        access_denied_message: props.provider.access_denied_message || '',
      })
    } else if (props.open && !props.provider) {
      form.reset({
        name: '',
        slug: '',
        icon: '',
        enabled: true,
        client_id: '',
        client_secret: '',
        authorization_endpoint: '',
        token_endpoint: '',
        user_info_endpoint: '',
        scopes: '',
        user_id_field: '',
        username_field: '',
        display_name_field: '',
        email_field: '',
        well_known: '',
        auth_style: 0,
        access_policy: '',
        access_denied_message: '',
      })
    }
  }, [props.open, props.provider, form])

  const onSubmit = async (values: CustomOAuthFormValues) => {
    if (isEditing && props.provider) {
      const res = await updateProvider.mutateAsync({
        id: props.provider.id,
        data: values,
      })
      if (res.success) {
        props.onOpenChange(false)
      }
    } else {
      const res = await createProvider.mutateAsync(
        values as Omit<CustomOAuthProvider, 'id'>
      )
      if (res.success) {
        props.onOpenChange(false)
      }
    }
  }

  const isPending = createProvider.isPending || updateProvider.isPending
  let submitLabel = t('Create Provider')
  if (isPending) {
    submitLabel = t('Saving...')
  } else if (isEditing) {
    submitLabel = t('Update Provider')
  }

  return { isEditing, form, callbackUrl, onSubmit, isPending, submitLabel }
}
