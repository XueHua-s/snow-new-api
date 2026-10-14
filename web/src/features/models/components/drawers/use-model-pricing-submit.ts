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
import type { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'

import type { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import { normalizeJsonString } from '@/features/system-settings/models/utils'
import type { ModelSettings } from '@/features/system-settings/types'
import { safeJsonParse } from '@/features/system-settings/utils/json-parser'

import { createModel, updateModel } from '../../api'
import { modelsQueryKeys } from '../../lib'
import type { PricingMode } from './model-mutate-pricing'
import type { ExtendedModelFormValues } from './use-model-mutate-form'

export function useModelPricingSubmit({
  setIsSubmitting,
  isEditing,
  currentModelId,
  pricingMode,
  modelSettings,
  oldModelName,
  loadedPricingName,
  updateOption,
  queryClient,
  onOpenChange,
}: {
  setIsSubmitting: (value: boolean) => void
  isEditing: boolean
  currentModelId: number | undefined
  pricingMode: PricingMode
  modelSettings: ModelSettings | null
  oldModelName: string
  loadedPricingName: string
  updateOption: ReturnType<typeof useUpdateOption>
  queryClient: ReturnType<typeof useQueryClient>
  onOpenChange: (open: boolean) => void
}) {
  const onSubmit = useCallback(
    async (values: ExtendedModelFormValues): Promise<void> => {
      setIsSubmitting(true)
      try {
        const submitData = {
          ...values,
          id: isEditing ? currentModelId : undefined,
          tags: Array.isArray(values.tags) ? values.tags.join(',') : '',
          status: values.status ? 1 : 0,
          sync_official: values.sync_official ? 1 : 0,
        }

        // Remove ratio fields from model data (they're stored in system settings)
        const {
          price,
          ratio,
          cacheRatio,
          completionRatio,
          imageRatio,
          audioRatio,
          audioCompletionRatio,
          ...modelData
        } = submitData

        const response =
          isEditing && currentModelId
            ? await updateModel({ ...modelData, id: currentModelId })
            : await createModel(modelData)

        if (response.success) {
          // Handle ratio configuration updates in system settings
          const finalModelName = values.model_name
          const hasRatioConfig =
            (pricingMode === 'per-request' &&
              values.price &&
              values.price !== '') ||
            (pricingMode === 'per-token' &&
              (values.ratio ||
                values.cacheRatio ||
                values.completionRatio ||
                values.imageRatio ||
                values.audioRatio ||
                values.audioCompletionRatio))

          // Always process system settings updates if we have modelSettings
          // This ensures we can remove stale entries even when clearing all pricing fields
          if (modelSettings) {
            // Read existing configurations
            const priceMap = safeJsonParse<Record<string, number>>(
              modelSettings.ModelPrice,
              { fallback: {}, silent: true }
            )
            const ratioMap = safeJsonParse<Record<string, number>>(
              modelSettings.ModelRatio,
              { fallback: {}, silent: true }
            )
            const cacheMap = safeJsonParse<Record<string, number>>(
              modelSettings.CacheRatio,
              { fallback: {}, silent: true }
            )
            const completionMap = safeJsonParse<Record<string, number>>(
              modelSettings.CompletionRatio,
              { fallback: {}, silent: true }
            )
            const imageMap = safeJsonParse<Record<string, number>>(
              modelSettings.ImageRatio,
              { fallback: {}, silent: true }
            )
            const audioMap = safeJsonParse<Record<string, number>>(
              modelSettings.AudioRatio,
              { fallback: {}, silent: true }
            )
            const audioCompletionMap = safeJsonParse<Record<string, number>>(
              modelSettings.AudioCompletionRatio,
              { fallback: {}, silent: true }
            )

            // Remove old model name entries if model name changed (always, even if no new config)
            if (isEditing && oldModelName && oldModelName !== finalModelName) {
              delete priceMap[oldModelName]
              delete ratioMap[oldModelName]
              delete cacheMap[oldModelName]
              delete completionMap[oldModelName]
              delete imageMap[oldModelName]
              delete audioMap[oldModelName]
              delete audioCompletionMap[oldModelName]
            }

            // Rebuild this model name's entries from the form, but only when
            // the form speaks for that name: it loaded the name's pricing when
            // the drawer opened, so clearing every field means "remove
            // pricing", or the user typed pricing in, which then wins outright
            // (this is also what replaces the old entries across a mode
            // switch). A name the form never loaded may still have pricing
            // configured elsewhere, and an untouched pricing section must not
            // wipe it -- that covers creating a model over an existing name,
            // and renaming onto one.
            if (hasRatioConfig || finalModelName === loadedPricingName) {
              delete priceMap[finalModelName]
              delete ratioMap[finalModelName]
              delete cacheMap[finalModelName]
              delete completionMap[finalModelName]
              delete imageMap[finalModelName]
              delete audioMap[finalModelName]
              delete audioCompletionMap[finalModelName]
            }

            // Only add new entries if user provided new configuration
            if (hasRatioConfig) {
              if (
                pricingMode === 'per-request' &&
                values.price &&
                values.price !== ''
              ) {
                priceMap[finalModelName] = Number.parseFloat(values.price)
              } else if (pricingMode === 'per-token') {
                if (values.ratio && values.ratio !== '') {
                  ratioMap[finalModelName] = Number.parseFloat(values.ratio)
                }
                if (values.cacheRatio && values.cacheRatio !== '') {
                  cacheMap[finalModelName] = Number.parseFloat(
                    values.cacheRatio
                  )
                }
                if (values.completionRatio && values.completionRatio !== '') {
                  completionMap[finalModelName] = Number.parseFloat(
                    values.completionRatio
                  )
                }
                if (values.imageRatio && values.imageRatio !== '') {
                  imageMap[finalModelName] = Number.parseFloat(
                    values.imageRatio
                  )
                }
                if (values.audioRatio && values.audioRatio !== '') {
                  audioMap[finalModelName] = Number.parseFloat(
                    values.audioRatio
                  )
                }
                if (
                  values.audioCompletionRatio &&
                  values.audioCompletionRatio !== ''
                ) {
                  audioCompletionMap[finalModelName] = Number.parseFloat(
                    values.audioCompletionRatio
                  )
                }
              }
            }

            // Update system options if there are changes
            const updates: Array<{ key: string; value: string }> = []

            const newModelPrice = normalizeJsonString(JSON.stringify(priceMap))
            if (
              newModelPrice !== normalizeJsonString(modelSettings.ModelPrice)
            ) {
              updates.push({ key: 'ModelPrice', value: newModelPrice })
            }

            const newModelRatio = normalizeJsonString(JSON.stringify(ratioMap))
            if (
              newModelRatio !== normalizeJsonString(modelSettings.ModelRatio)
            ) {
              updates.push({ key: 'ModelRatio', value: newModelRatio })
            }

            const newCacheRatio = normalizeJsonString(JSON.stringify(cacheMap))
            if (
              newCacheRatio !== normalizeJsonString(modelSettings.CacheRatio)
            ) {
              updates.push({ key: 'CacheRatio', value: newCacheRatio })
            }

            const newCompletionRatio = normalizeJsonString(
              JSON.stringify(completionMap)
            )
            if (
              newCompletionRatio !==
              normalizeJsonString(modelSettings.CompletionRatio)
            ) {
              updates.push({
                key: 'CompletionRatio',
                value: newCompletionRatio,
              })
            }

            const newImageRatio = normalizeJsonString(JSON.stringify(imageMap))
            if (
              newImageRatio !== normalizeJsonString(modelSettings.ImageRatio)
            ) {
              updates.push({ key: 'ImageRatio', value: newImageRatio })
            }

            const newAudioRatio = normalizeJsonString(JSON.stringify(audioMap))
            if (
              newAudioRatio !== normalizeJsonString(modelSettings.AudioRatio)
            ) {
              updates.push({ key: 'AudioRatio', value: newAudioRatio })
            }

            const newAudioCompletionRatio = normalizeJsonString(
              JSON.stringify(audioCompletionMap)
            )
            if (
              newAudioCompletionRatio !==
              normalizeJsonString(modelSettings.AudioCompletionRatio)
            ) {
              updates.push({
                key: 'AudioCompletionRatio',
                value: newAudioCompletionRatio,
              })
            }

            // Apply all updates (including deletions when clearing fields)
            for (const update of updates) {
              await updateOption.mutateAsync(update)
            }
          }

          toast.success(
            isEditing
              ? 'Model updated successfully'
              : 'Model created successfully'
          )
          queryClient.invalidateQueries({ queryKey: modelsQueryKeys.lists() })
          queryClient.invalidateQueries({ queryKey: ['system-options'] })
          onOpenChange(false)
        } else {
          toast.error(response.message || 'Operation failed')
        }
      } catch (error: unknown) {
        toast.error((error as Error)?.message || 'Operation failed')
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      isEditing,
      currentModelId,
      queryClient,
      onOpenChange,
      pricingMode,
      oldModelName,
      loadedPricingName,
      modelSettings,
      updateOption,
      setIsSubmitting,
    ]
  )
  return { onSubmit }
}
