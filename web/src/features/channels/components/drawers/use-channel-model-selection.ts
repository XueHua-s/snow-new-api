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
import { useCallback } from 'react'
import type { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import { fetchModels } from '../../api'
import { MODEL_FETCHABLE_TYPES } from '../../constants'
import {
  CHANNEL_TYPE_ADVANCED_CUSTOM,
  type ChannelFormValues,
  formatModelsArray,
} from '../../lib'

export function useChannelModelSelection({
  currentModelsArray,
  form,
  isEditing,
  canEditSensitive,
  setFetchModelsDialogOpen,
  channelId,
  basicModels,
  allModelsList,
  copyToClipboard,
}: {
  currentModelsArray: string[]
  form: ReturnType<typeof useForm<ChannelFormValues>>
  isEditing: boolean
  canEditSensitive: boolean
  setFetchModelsDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  channelId: number | null
  basicModels: string[]
  allModelsList: string[]
  copyToClipboard: ReturnType<typeof useCopyToClipboard>['copyToClipboard']
}) {
  const { t } = useTranslation()
  const updateModels = useCallback(
    (newModels: string[], merge: boolean = false) => {
      const finalModels = merge
        ? formatModelsArray([...currentModelsArray, ...newModels])
        : formatModelsArray(newModels)
      form.setValue('models', finalModels)
      return newModels.length
    },
    [currentModelsArray, form]
  )

  const handleFetchModels = useCallback(async () => {
    const type = form.getValues('type')

    if (!MODEL_FETCHABLE_TYPES.has(type)) {
      toast.error(t('This channel type does not support fetching models'))
      return
    }

    if (!isEditing && !canEditSensitive) {
      toast.error(t("You don't have necessary permission"))
      return
    }

    // Advanced Custom may use a model discovery route with no authentication.
    if (!isEditing && type !== CHANNEL_TYPE_ADVANCED_CUSTOM) {
      const key = form.getValues('key')
      if (!key?.trim()) {
        toast.error(t('Please enter API key first'))
        return
      }
    }

    setFetchModelsDialogOpen(true)
  }, [isEditing, canEditSensitive, form, t, setFetchModelsDialogOpen])

  const formPreviewFetcher = useCallback(async (): Promise<string[]> => {
    if (!canEditSensitive) {
      throw new Error(t("You don't have necessary permission"))
    }
    const type = form.getValues('type')
    const editingAdvancedCustom =
      isEditing && type === CHANNEL_TYPE_ADVANCED_CUSTOM
    if (editingAdvancedCustom && channelId === null) {
      throw new Error(t('No channel selected'))
    }
    const response = await fetchModels({
      type,
      key: isEditing ? undefined : form.getValues('key'),
      channel_id: editingAdvancedCustom ? channelId || undefined : undefined,
      base_url: form.getValues('base_url') || '',
      advanced_custom: form.getValues('advanced_custom'),
      header_override: form.getValues('header_override'),
      proxy: form.getValues('proxy'),
    })
    if (response.success && response.data) {
      return response.data
    }
    throw new Error(response.message || t('No models fetched from upstream'))
  }, [canEditSensitive, channelId, form, isEditing, t])

  const handleFillRelatedModels = useCallback(() => {
    if (!basicModels.length) {
      toast.info(t('No related models available for this channel type'))
      return
    }
    updateModels(basicModels)
    toast.success(
      t('Filled {{count}} related model(s)', { count: basicModels.length })
    )
  }, [basicModels, updateModels, t])

  const handleFillAllModels = useCallback(() => {
    if (!allModelsList.length) {
      toast.info(t('No models available'))
      return
    }
    updateModels(allModelsList)
    toast.success(
      t('Filled {{count}} model(s)', { count: allModelsList.length })
    )
  }, [allModelsList, updateModels, t])

  const handleClearModels = useCallback(() => {
    form.setValue('models', '')
    toast.success(t('Cleared all models'))
  }, [form, t])

  const handleCopyModels = useCallback(async () => {
    const models = form.getValues('models')
    if (!models?.trim()) {
      toast.info(t('No models to copy'))
      return
    }
    await copyToClipboard(models)
  }, [form, copyToClipboard, t])

  const handleAddPrefillGroup = useCallback(
    (group: { id: number; name: string; items: string | string[] }) => {
      try {
        const items = Array.isArray(group.items)
          ? group.items
          : JSON.parse(group.items)

        if (!Array.isArray(items)) {
          throw new Error('Invalid items format')
        }

        const count = updateModels(items, true)
        toast.success(
          t('Added {{count}} models from "{{name}}"', {
            count,
            name: group.name,
          })
        )
      } catch {
        toast.error(t('Failed to parse group items'))
      }
    },
    [updateModels, t]
  )

  const handleModelsChange = useCallback(
    (selected: string[]) => {
      form.setValue('models', selected.join(','))
    },
    [form]
  )
  return {
    updateModels,
    handleFetchModels,
    formPreviewFetcher,
    handleFillRelatedModels,
    handleFillAllModels,
    handleClearModels,
    handleCopyModels,
    handleAddPrefillGroup,
    handleModelsChange,
  }
}
