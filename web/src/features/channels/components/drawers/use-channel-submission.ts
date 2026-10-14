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
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { useSecureVerification } from '@/features/auth/secure-verification'

import { ERROR_MESSAGES } from '../../constants'
import { useChannelMutateForm } from '../../hooks/use-channel-mutate-form'
import {
  channelsQueryKeys,
  type ChannelFormValues,
  parseModelsString,
  formatModelsArray,
  hasModelConfigChanged,
  findMissingModelsInMapping,
  validateModelMappingJson,
} from '../../lib'
import {
  collectInvalidStatusCodeEntries,
  collectNewDisallowedStatusCodeRedirects,
} from '../../lib/status-code-risk-guard'
import type { Channel } from '../../types'
import { useChannels } from '../channels-provider'
import type { ChannelEditBaseline } from './channel-edit-baseline'
import { SENSITIVE_FORM_FIELDS } from './channel-editor-state'
import { useChannelSaveConfirmation } from './use-channel-save-confirmation'

/** Validates channel edits and obtains confirmations and security proof before saving. */
export function useChannelSubmission({
  open,
  onOpenChange,
  currentRow,
  isMultiKeyChannel,
  form,
  sensitiveLocked,
  initialConfig,
  startVerification,
  withVerification,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Channel | null | undefined
  isMultiKeyChannel: boolean
  form: ReturnType<typeof useForm<ChannelFormValues>>
  sensitiveLocked: boolean
  initialConfig: React.RefObject<ChannelEditBaseline>
  startVerification: ReturnType<
    typeof useSecureVerification
  >['startVerification']
  withVerification: ReturnType<typeof useSecureVerification>['withVerification']
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { setOpen } = useChannels()
  const channelId = currentRow?.id ?? null
  const isEditing = Boolean(currentRow)
  const handleSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
    if (channelId) {
      queryClient.invalidateQueries({
        queryKey: channelsQueryKeys.detail(channelId),
      })
    }
    onOpenChange(false)
    setOpen(null)
  }, [channelId, queryClient, onOpenChange, setOpen])

  const confirmations = useChannelSaveConfirmation(open, channelId)
  const { confirmMissingModelMappings, confirmStatusCodeRisk } = confirmations

  const channelMutation = useChannelMutateForm({
    currentRow,
    isEditing,
    isMultiKeyChannel,
    onSuccess: handleSuccess,
  })

  const isSubmitting = channelMutation.isPending

  const onSubmit = useCallback(
    async (data: ChannelFormValues) => {
      // Validate key is required when creating
      if (!isEditing && !data.key?.trim()) {
        form.setError('key', {
          type: 'manual',
          message: ERROR_MESSAGES.REQUIRED_KEY,
        })
        return
      }

      if (sensitiveLocked) {
        const dirtyFields = form.formState.dirtyFields as Partial<
          Record<keyof ChannelFormValues, unknown>
        >
        const hasSensitiveChanges = SENSITIVE_FORM_FIELDS.some((field) =>
          Boolean(dirtyFields[field])
        )
        if (hasSensitiveChanges) {
          toast.error(
            t('You do not have permission to edit sensitive channel settings.')
          )
          return
        }
      }

      // Validate status_code_mapping entries
      if (data.status_code_mapping?.trim()) {
        const invalidEntries = collectInvalidStatusCodeEntries(
          data.status_code_mapping
        )
        if (invalidEntries.length > 0) {
          toast.error(
            t('Invalid status code mapping entries: {{entries}}', {
              entries: invalidEntries.join(', '),
            })
          )
          return
        }

        const riskyRedirects = collectNewDisallowedStatusCodeRedirects(
          initialConfig.current.statusCodeMapping,
          data.status_code_mapping
        )
        if (riskyRedirects.length > 0) {
          const confirmed = await confirmStatusCodeRisk(riskyRedirects)
          if (!confirmed) return
        }
      }

      // Validate model_mapping JSON format
      const hasModelMapping =
        typeof data.model_mapping === 'string' &&
        data.model_mapping.trim() !== ''
      const modelMappingValue = data.model_mapping || ''

      if (hasModelMapping) {
        const validation = validateModelMappingJson(modelMappingValue)
        if (!validation.valid) {
          toast.error(t(validation.error || 'Invalid model mapping'))
          return
        }
      }

      // Normalize models array
      const normalizedModels = parseModelsString(data.models || '')

      // Check for missing models in model_mapping
      if (hasModelMapping) {
        const missingModels = findMissingModelsInMapping(
          modelMappingValue,
          normalizedModels
        )

        const shouldPromptMissing =
          missingModels.length > 0 &&
          hasModelConfigChanged(
            normalizedModels,
            data.model_mapping || '',
            initialConfig.current.models,
            initialConfig.current.modelMapping
          )

        if (shouldPromptMissing) {
          const confirmAction = await confirmMissingModelMappings(missingModels)
          if (confirmAction === 'cancel') {
            return
          }
          if (confirmAction === 'add') {
            const updatedModels = [
              ...new Set([...normalizedModels, ...missingModels]),
            ]
            data.models = formatModelsArray(updatedModels)
            form.setValue('models', data.models)
          }
        }
      }

      const save = (proofToken?: string) =>
        channelMutation.mutateAsync({ data, proofToken })
      if (
        isEditing &&
        (currentRow?.type === 57 || data.type === 57) &&
        (Boolean(data.key?.trim()) || data.type !== currentRow?.type)
      ) {
        await startVerification(save, {
          scope: 'channel.codex.credentials.write',
        })
      } else {
        await withVerification(save, {
          scope: 'channel.codex.credentials.write',
        })
      }
    },
    [
      isEditing,
      sensitiveLocked,
      form,
      confirmMissingModelMappings,
      confirmStatusCodeRisk,
      channelMutation,
      currentRow,
      startVerification,
      withVerification,
      t,
      initialConfig,
    ]
  )
  return {
    ...confirmations,
    isSubmitting,
    onSubmit,
  }
}
