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
import { Boxes, KeyRound, Server, Settings } from 'lucide-react'
import { useMemo } from 'react'
import type { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  CLAUDE_FIELD_PASSTHROUGH_TYPES,
  CHANNEL_STATUS_LABELS,
  FIELD_PASSTHROUGH_TYPES,
  MODEL_FETCHABLE_TYPES,
  OPENAI_FIELD_PASSTHROUGH_TYPES,
} from '../../constants'
import {
  type ChannelFormValues,
  parseModelsString,
  hasAdvancedSettingsErrors,
} from '../../lib'
import type {
  ChannelEditorSectionStatus,
  ChannelEditorNavChildItem,
  ChannelEditorNavItem,
} from './channel-editor-navigation'
import {
  CHANNEL_EDITOR_SECTION_IDS,
  hasConfiguredOverrideValue,
  ADVANCED_SETTINGS_SECTION_IDS,
} from './channel-editor-state'
import {
  getCompletionStatus,
  getSectionStatusLabel,
} from './channel-editor-status'

export function useChannelEditorProgress({
  form,
  isEditing,
}: {
  form: ReturnType<typeof useForm<ChannelFormValues>>
  isEditing: boolean
}) {
  const { t } = useTranslation()
  const multiKeyMode = form.watch('multi_key_mode')

  const multiKeyType = form.watch('multi_key_type')

  const keyMode = form.watch('key_mode')

  const currentGroups = form.watch('group')

  const currentType = form.watch('type')

  const currentStatus = form.watch('status')

  const currentBaseUrl = form.watch('base_url')

  const currentKey = form.watch('key')

  const currentOther = form.watch('other')

  const currentModels = form.watch('models')

  const currentName = form.watch('name')

  const currentModelMapping = form.watch('model_mapping')

  const awsKeyType = form.watch('aws_key_type')

  const vertexKeyType = form.watch('vertex_key_type')

  const upstreamModelUpdateCheckEnabled = form.watch(
    'upstream_model_update_check_enabled'
  )

  const currentSettings = form.watch('settings')

  const currentAdvancedCustom = form.watch('advanced_custom')

  const currentPriority = form.watch('priority')

  const currentWeight = form.watch('weight')

  const currentTestModel = form.watch('test_model')

  const currentAutoBan = form.watch('auto_ban')

  const currentTag = form.watch('tag')

  const currentRemark = form.watch('remark')

  const currentStatusCodeMapping = form.watch('status_code_mapping')

  const currentParamOverride = form.watch('param_override')

  const currentHeaderOverride = form.watch('header_override')

  const currentForceFormat = form.watch('force_format')

  const currentThinkingToContent = form.watch('thinking_to_content')

  const currentPassThroughBodyEnabled = form.watch('pass_through_body_enabled')

  const currentDisableTaskPollingSleep = form.watch(
    'disable_task_polling_sleep'
  )

  const currentProxy = form.watch('proxy')

  const currentHttpProtocol = form.watch('http_protocol')

  const currentHttp2ConnectionShards = form.watch('http2_connection_shards')

  const currentSystemPrompt = form.watch('system_prompt')

  const currentSystemPromptOverride = form.watch('system_prompt_override')

  const currentAllowServiceTier = form.watch('allow_service_tier')

  const currentDisableStore = form.watch('disable_store')

  const currentAllowSafetyIdentifier = form.watch('allow_safety_identifier')

  const currentAllowIncludeObfuscation = form.watch('allow_include_obfuscation')

  const currentAllowInferenceGeo = form.watch('allow_inference_geo')

  const currentAllowSpeed = form.watch('allow_speed')

  const currentClaudeBetaQuery = form.watch('claude_beta_query')

  const currentUpstreamModelUpdateAutoSyncEnabled = form.watch(
    'upstream_model_update_auto_sync_enabled'
  )

  const currentUpstreamModelUpdateIgnoredModels = form.watch(
    'upstream_model_update_ignored_models'
  )

  const currentModelsArray = useMemo(
    () => parseModelsString(currentModels),
    [currentModels]
  )

  const formErrors = form.formState.errors

  const identityHasErrors = Boolean(
    formErrors.name ||
    formErrors.type ||
    formErrors.status ||
    formErrors.openai_organization
  )

  const credentialsHaveErrors = Boolean(
    formErrors.key ||
    formErrors.base_url ||
    formErrors.other ||
    formErrors.multi_key_mode ||
    formErrors.multi_key_type ||
    formErrors.key_mode ||
    formErrors.vertex_key_type ||
    formErrors.aws_key_type ||
    formErrors.azure_responses_version
  )

  const modelsHaveErrors = Boolean(
    formErrors.models || formErrors.group || formErrors.model_mapping
  )

  const advancedHaveErrors =
    hasAdvancedSettingsErrors(formErrors) || Boolean(formErrors.advanced_custom)

  const providerRequiresBaseUrl = [3, 8, 36, 45].includes(currentType)

  const providerRequiresOther = [3, 18, 21, 39, 41, 49].includes(currentType)

  const identityComplete = Boolean(currentName?.trim() && currentType > 0)

  const credentialsComplete = Boolean(
    (isEditing || currentKey?.trim()) &&
    (!providerRequiresBaseUrl || currentBaseUrl?.trim()) &&
    (!providerRequiresOther || currentOther?.trim())
  )

  const modelsComplete = Boolean(
    currentModelsArray.length > 0 && currentGroups?.length
  )

  const requiredCompletedCount = [
    identityComplete,
    credentialsComplete,
    modelsComplete,
  ].filter(Boolean).length

  const currentStatusLabel =
    CHANNEL_STATUS_LABELS[
      currentStatus as keyof typeof CHANNEL_STATUS_LABELS
    ] || 'Unknown'

  const progressLabel = `${requiredCompletedCount}/3`

  const identityStatus = getCompletionStatus(
    identityHasErrors,
    identityComplete
  )

  const credentialsStatus = getCompletionStatus(
    credentialsHaveErrors,
    credentialsComplete
  )

  const modelsStatus = getCompletionStatus(modelsHaveErrors, modelsComplete)

  const advancedStatus: ChannelEditorSectionStatus = advancedHaveErrors
    ? 'error'
    : 'idle'

  const advancedSummary = advancedHaveErrors ? t('Error') : undefined

  const routingStrategyConfigured = Boolean(
    currentPriority ||
    currentWeight ||
    currentTestModel?.trim() ||
    (currentAutoBan ?? 1) !== 1
  )

  const internalNotesConfigured = Boolean(
    currentTag?.trim() || currentRemark?.trim()
  )

  const overrideRulesConfigured = Boolean(
    hasConfiguredOverrideValue(currentStatusCodeMapping) ||
    hasConfiguredOverrideValue(currentParamOverride) ||
    hasConfiguredOverrideValue(currentHeaderOverride)
  )

  const extraSettingsConfigured = Boolean(
    currentForceFormat ||
    currentThinkingToContent ||
    currentPassThroughBodyEnabled ||
    currentDisableTaskPollingSleep ||
    currentProxy?.trim() ||
    currentSystemPrompt?.trim() ||
    currentSystemPromptOverride ||
    (currentHttpProtocol && currentHttpProtocol !== 'auto') ||
    (currentHttp2ConnectionShards != null && currentHttp2ConnectionShards > 1)
  )

  let fieldPassthroughConfigured = false

  if (OPENAI_FIELD_PASSTHROUGH_TYPES.has(currentType)) {
    fieldPassthroughConfigured = Boolean(
      currentAllowServiceTier ||
      currentDisableStore ||
      currentAllowSafetyIdentifier ||
      currentAllowIncludeObfuscation ||
      currentAllowInferenceGeo
    )
  }

  if (CLAUDE_FIELD_PASSTHROUGH_TYPES.has(currentType)) {
    fieldPassthroughConfigured =
      fieldPassthroughConfigured ||
      Boolean(
        currentAllowServiceTier ||
        currentAllowInferenceGeo ||
        currentAllowSpeed ||
        (currentType === 14 && currentClaudeBetaQuery)
      )
  }

  const upstreamModelDetectionConfigured = Boolean(
    upstreamModelUpdateCheckEnabled ||
    currentUpstreamModelUpdateAutoSyncEnabled ||
    currentUpstreamModelUpdateIgnoredModels?.trim()
  )

  const advancedConfigured = Boolean(
    routingStrategyConfigured ||
    internalNotesConfigured ||
    overrideRulesConfigured ||
    extraSettingsConfigured ||
    fieldPassthroughConfigured ||
    upstreamModelDetectionConfigured
  )

  const advancedNavChildren: ChannelEditorNavChildItem[] = [
    {
      id: ADVANCED_SETTINGS_SECTION_IDS.routingStrategy,
      title: t('Routing Strategy'),
      configured: routingStrategyConfigured,
    },
    {
      id: ADVANCED_SETTINGS_SECTION_IDS.internalNotes,
      title: t('Internal Notes'),
      configured: internalNotesConfigured,
    },
    {
      id: ADVANCED_SETTINGS_SECTION_IDS.overrideRules,
      title: t('Override Rules'),
      configured: overrideRulesConfigured,
    },
    {
      id: ADVANCED_SETTINGS_SECTION_IDS.extraSettings,
      title: t('Channel Extra Settings'),
      configured: extraSettingsConfigured,
    },
  ]

  if (FIELD_PASSTHROUGH_TYPES.has(currentType)) {
    advancedNavChildren.push({
      id: ADVANCED_SETTINGS_SECTION_IDS.fieldPassthrough,
      title: t('Field passthrough controls'),
      configured: fieldPassthroughConfigured,
    })
  }

  if (MODEL_FETCHABLE_TYPES.has(currentType)) {
    advancedNavChildren.push({
      id: ADVANCED_SETTINGS_SECTION_IDS.upstreamModelDetection,
      title: t('Upstream Model Detection Settings'),
      configured: upstreamModelDetectionConfigured,
    })
  }

  const editorNavItems: ChannelEditorNavItem[] = [
    {
      id: CHANNEL_EDITOR_SECTION_IDS.identity,
      title: t('Basic Information'),
      description: getSectionStatusLabel(identityStatus, t),
      statusLabel: getSectionStatusLabel(identityStatus, t),
      status: identityStatus,
      icon: <Server className='h-4 w-4' aria-hidden='true' />,
    },
    {
      id: CHANNEL_EDITOR_SECTION_IDS.credentials,
      title: t('Credentials'),
      description: getSectionStatusLabel(credentialsStatus, t),
      statusLabel: getSectionStatusLabel(credentialsStatus, t),
      status: credentialsStatus,
      icon: <KeyRound className='h-4 w-4' aria-hidden='true' />,
    },
    {
      id: CHANNEL_EDITOR_SECTION_IDS.models,
      title: t('Models & Groups'),
      description: getSectionStatusLabel(modelsStatus, t),
      statusLabel: getSectionStatusLabel(modelsStatus, t),
      status: modelsStatus,
      icon: <Boxes className='h-4 w-4' aria-hidden='true' />,
    },
    {
      id: CHANNEL_EDITOR_SECTION_IDS.advanced,
      title: t('Advanced Settings'),
      description: advancedSummary,
      statusLabel: advancedSummary ?? t('Advanced Settings'),
      status: advancedStatus,
      icon: <Settings className='h-4 w-4' aria-hidden='true' />,
      configured: advancedConfigured,
      children: advancedNavChildren,
    },
  ]
  return {
    multiKeyMode,
    multiKeyType,
    keyMode,
    currentGroups,
    currentType,
    currentBaseUrl,
    currentName,
    currentModelMapping,
    awsKeyType,
    vertexKeyType,
    upstreamModelUpdateCheckEnabled,
    currentSettings,
    currentAdvancedCustom,
    currentHttpProtocol,
    currentModelsArray,
    currentStatusLabel,
    progressLabel,
    advancedSummary,
    routingStrategyConfigured,
    internalNotesConfigured,
    overrideRulesConfigured,
    extraSettingsConfigured,
    fieldPassthroughConfigured,
    upstreamModelDetectionConfigured,
    editorNavItems,
  }
}
