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
import { useEffect } from 'react'
import type { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { getChannel } from '../../api'
import {
  CHANNEL_FORM_DEFAULT_VALUES,
  transformChannelToFormDefaults,
  type ChannelFormValues,
  parseModelsString,
} from '../../lib'
import type { ChannelEditBaseline } from './channel-edit-baseline'
import {
  readAdvancedSettingsPreference,
  hasAdvancedSettingsValues,
} from './channel-editor-state'

export function useChannelFormLifecycle({
  isEditing,
  channelData,
  form,
  setAdvancedSettingsOpen,
  initialConfig,
  currentType,
  currentBaseUrl,
  supportsMultiKeyAddMode,
  multiKeyMode,
}: {
  isEditing: boolean
  channelData: Awaited<ReturnType<typeof getChannel>> | undefined
  form: ReturnType<typeof useForm<ChannelFormValues>>
  setAdvancedSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>
  initialConfig: React.RefObject<ChannelEditBaseline>
  currentType: number
  currentBaseUrl: ChannelFormValues['base_url']
  supportsMultiKeyAddMode: boolean
  multiKeyMode: ChannelFormValues['multi_key_mode']
}) {
  const { t } = useTranslation()
  useEffect(() => {
    if (isEditing && channelData?.data) {
      const defaults = transformChannelToFormDefaults(channelData.data)
      form.reset(defaults)
      setAdvancedSettingsOpen(
        readAdvancedSettingsPreference() || hasAdvancedSettingsValues(defaults)
      )
      // Store initial values for comparison
      initialConfig.current.models = parseModelsString(
        channelData.data.models || ''
      )
      initialConfig.current.modelMapping = channelData.data.model_mapping || ''
      initialConfig.current.statusCodeMapping =
        channelData.data.status_code_mapping || ''
    } else if (!isEditing) {
      form.reset(CHANNEL_FORM_DEFAULT_VALUES)
      setAdvancedSettingsOpen(false)
      initialConfig.current.models = []
      initialConfig.current.modelMapping = ''
      initialConfig.current.statusCodeMapping = ''
    }
  }, [isEditing, channelData, form, setAdvancedSettingsOpen, initialConfig])

  useEffect(() => {
    if (isEditing) return // Don't auto-set defaults when editing

    // Type 45 (VolcEngine) - set default base_url
    if (currentType === 45) {
      const currentBaseUrlValue = form.getValues('base_url')
      if (!currentBaseUrlValue || currentBaseUrlValue === '') {
        form.setValue('base_url', 'https://ark.cn-beijing.volces.com')
      }
    }

    // Type 18 (Xunfei) - set default other (version)
    if (currentType === 18) {
      const currentOther = form.getValues('other')
      if (!currentOther || currentOther === '') {
        form.setValue('other', 'v2.1')
      }
    }
  }, [currentType, isEditing, form])

  useEffect(() => {
    if (currentType !== 45 || currentBaseUrl !== 'doubao-coding-plan') return

    form.setValue('base_url', 'https://ark.cn-beijing.volces.com', {
      shouldDirty: false,
      shouldValidate: true,
    })
  }, [currentBaseUrl, currentType, form])

  useEffect(() => {
    if (isEditing || supportsMultiKeyAddMode) return
    if (multiKeyMode && multiKeyMode !== 'single') {
      form.setValue('multi_key_mode', 'single', {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [form, isEditing, multiKeyMode, supportsMultiKeyAddMode])

  useEffect(() => {
    if (!currentBaseUrl || !currentBaseUrl.endsWith('/v1')) return

    // Show warning toast
    const timer = setTimeout(() => {
      toast.warning(
        t(
          'Warning: Base URL should not end with /v1. New API will handle it automatically. This may cause request failures.'
        ),
        { duration: 5000 }
      )
    }, 500)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBaseUrl])
}
