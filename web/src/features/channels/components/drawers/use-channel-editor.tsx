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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useSecureVerification } from '@/features/auth/secure-verification'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { useHiddenClickUnlock } from '@/hooks/use-hidden-click-unlock'
import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import type { ChannelConnectionInfo } from '@/lib/channel-connection-info'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  getAllModels,
  getChannel,
  getGroups,
  getPrefillGroups,
} from '../../api'
import {
  CHANNEL_FORM_DEFAULT_VALUES,
  CHANNEL_TYPE_ADVANCED_CUSTOM,
  channelFormSchema,
  channelsQueryKeys,
  type ChannelFormValues,
} from '../../lib'
import type { Channel } from '../../types'
import type { ChannelEditBaseline } from './channel-edit-baseline'
import { useChannelConnectionClipboard } from './use-channel-connection-clipboard'
import { useChannelCredentialActions } from './use-channel-credential-actions'
import { useChannelEditorOptions } from './use-channel-editor-options'
import { useChannelEditorProgress } from './use-channel-editor-progress'
import { useChannelFormLifecycle } from './use-channel-form-lifecycle'
import { useChannelModelDiagnostics } from './use-channel-model-diagnostics'
import { useChannelModelSelection } from './use-channel-model-selection'
import { useChannelNavigation } from './use-channel-navigation'
import { useChannelSubmission } from './use-channel-submission'

export type ChannelMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Channel | null
}

/** Composes channel form domains; private confirmation and navigation state stays in its owner. */
export function useChannelEditor({
  open,
  onOpenChange,
  currentRow,
}: ChannelMutateDrawerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.auth.user)
  const canEditSensitive = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.CHANNEL,
    ADMIN_PERMISSION_ACTIONS.SENSITIVE_WRITE
  )
  const canRevealChannelKey = currentUser?.role === ROLE.SUPER_ADMIN
  const [fetchModelsDialogOpen, setFetchModelsDialogOpen] = useState(false)
  const [codexOAuthDialogOpen, setCodexOAuthDialogOpen] = useState(false)
  const [claudeOAuthDialogOpen, setClaudeOAuthDialogOpen] = useState(false)
  const initialConfig = useRef<ChannelEditBaseline>({
    models: [],
    modelMapping: '',
    statusCodeMapping: '',
  })
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false)
  const [paramOverrideEditorOpen, setParamOverrideEditorOpen] = useState(false)
  const [advancedCustomEditorOpen, setAdvancedCustomEditorOpen] =
    useState(false)
  const [clipboardConnectionInfo, setClipboardConnectionInfo] =
    useState<ChannelConnectionInfo | null>(null)

  const isEditing = Boolean(currentRow)
  const channelId = currentRow?.id ?? null
  const sensitiveLocked = isEditing && !canEditSensitive

  // Fetch channel details if editing
  const { data: channelData, isLoading: isChannelLoading } = useQuery({
    queryKey: channelsQueryKeys.detail(channelId || 0),
    queryFn: () => getChannel(channelId || 0),
    enabled: isEditing && Boolean(channelId),
  })

  // Fetch available groups
  const { data: groupsData, isLoading: isLoadingGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
  })

  // Fetch all available models
  const { data: allModelsData } = useQuery({
    queryKey: ['channel_models'],
    queryFn: getAllModels,
  })

  // Fetch prefill model groups
  const { data: prefillGroupsData } = useQuery({
    queryKey: ['prefill_groups', 'model'],
    queryFn: () => getPrefillGroups('model'),
  })

  const { copyToClipboard } = useCopyToClipboard()

  const {
    open: verificationOpen,
    methods: verificationMethods,
    state: verificationState,
    executeVerification,
    withVerification,
    startVerification,
    cancel: cancelVerification,
    setCode: setVerificationCode,
    switchMethod: switchVerificationMethod,
  } = useSecureVerification()

  useEffect(() => {
    cancelVerification()
  }, [open, channelId, cancelVerification])

  // Check if this is a multi-key channel
  const isMultiKeyChannel =
    isEditing && channelData?.data?.channel_info?.is_multi_key === true

  // Form setup
  const form = useForm<ChannelFormValues>({
    resolver: zodResolver(channelFormSchema),
    defaultValues: CHANNEL_FORM_DEFAULT_VALUES,
  })

  // Watch form values for conditional rendering
  const {
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
  } = useChannelEditorProgress({ form, isEditing })

  const shouldPreviewUnsavedModels =
    !isEditing ||
    (currentType === CHANNEL_TYPE_ADVANCED_CUSTOM && canEditSensitive)
  const {
    unlocked: doubaoApiEditUnlocked,
    handleClick: handleApiConfigSecretClick,
    reset: resetDoubaoApiUnlock,
  } = useHiddenClickUnlock({
    requiredClicks: 10,
    disabled: currentType !== 45 || sensitiveLocked,
    onUnlock: () => {
      toast.info(t('Doubao custom API address editing unlocked'))
    },
  })

  useEffect(() => {
    if (!open) {
      resetDoubaoApiUnlock()
    }
  }, [open, resetDoubaoApiUnlock])

  const channelConnectionClipboard = useChannelConnectionClipboard({
    form,
    setClipboardConnectionInfo,
    open,
    isEditing,
  })

  // Helper computed values
  const {
    isBatchMode,
    isChannelDetailLoading,
    supportsMultiKeyAddMode,
    addModeOptions,
    advancedCustomStats,
    advancedCustomRouteTypeLabels,
    hiddenAdvancedCustomRouteTypeCount,
    advancedCustomRouteTypeTitle,
    allModelsList,
    basicModels,
    prefillGroups,
    groupOptions,
    currentTypeLabel,
    channelTypeOptions,
  } = useChannelEditorOptions({
    multiKeyMode,
    isEditing,
    isChannelLoading,
    currentType,
    vertexKeyType,
    currentAdvancedCustom,
    allModelsData,
    prefillGroupsData,
    groupsData,
    currentGroups,
  })

  // Extract redirect models from model_mapping (target values)
  const channelModelDiagnostics = useChannelModelDiagnostics({
    currentModelMapping,
    allModelsList,
    currentModelsArray,
    currentSettings,
  })

  // Load channel data into form when editing
  useChannelFormLifecycle({
    isEditing,
    channelData,
    form,
    setAdvancedSettingsOpen,
    initialConfig,
    currentType,
    currentBaseUrl,
    supportsMultiKeyAddMode,
    multiKeyMode,
  })

  // Handle key deduplication
  const channelCredentialActions = useChannelCredentialActions({
    open,
    form,
    channelId,
    withVerification,
    startVerification,
    queryClient,
  })

  // Unified function to update models
  const channelModelSelection = useChannelModelSelection({
    currentModelsArray,
    form,
    isEditing,
    canEditSensitive,
    setFetchModelsDialogOpen,
    channelId,
    basicModels,
    allModelsList,
    copyToClipboard,
  })

  // Handle successful submission
  const channelSubmission = useChannelSubmission({
    open,
    onOpenChange,
    currentRow,
    isMultiKeyChannel,
    form,
    sensitiveLocked,
    initialConfig,
    startVerification,
    withVerification,
  })

  const channelNavigation = useChannelNavigation({
    setAdvancedSettingsOpen,
    advancedSettingsOpen,
    open,
    isChannelDetailLoading,
  })

  // Handle drawer close
  const { resetNavigation } = channelNavigation
  const handleOpenChange = useCallback(
    (v: boolean) => {
      onOpenChange(v)
      if (!v) {
        form.reset(CHANNEL_FORM_DEFAULT_VALUES)
        resetNavigation()
        setAdvancedSettingsOpen(false)
        setClipboardConnectionInfo(null)
      }
    },
    [onOpenChange, form, resetNavigation]
  )

  return {
    queryClient,
    canEditSensitive,
    canRevealChannelKey,
    fetchModelsDialogOpen,
    setFetchModelsDialogOpen,
    codexOAuthDialogOpen,
    setCodexOAuthDialogOpen,
    claudeOAuthDialogOpen,
    setClaudeOAuthDialogOpen,
    advancedSettingsOpen,
    paramOverrideEditorOpen,
    setParamOverrideEditorOpen,
    advancedCustomEditorOpen,
    setAdvancedCustomEditorOpen,
    clipboardConnectionInfo,
    setClipboardConnectionInfo,
    isEditing,
    channelId,
    sensitiveLocked,
    isLoadingGroups,
    copyToClipboard,
    verificationOpen,
    verificationMethods,
    verificationState,
    executeVerification,
    cancelVerification,
    setVerificationCode,
    switchVerificationMethod,
    isMultiKeyChannel,
    form,
    multiKeyMode,
    multiKeyType,
    keyMode,
    currentType,
    currentName,
    awsKeyType,
    vertexKeyType,
    upstreamModelUpdateCheckEnabled,
    currentHttpProtocol,
    shouldPreviewUnsavedModels,
    doubaoApiEditUnlocked,
    handleApiConfigSecretClick,
    ...channelConnectionClipboard,

    isBatchMode,
    isChannelDetailLoading,
    addModeOptions,
    advancedCustomStats,
    advancedCustomRouteTypeLabels,
    hiddenAdvancedCustomRouteTypeCount,
    advancedCustomRouteTypeTitle,
    allModelsList,
    basicModels,
    prefillGroups,
    groupOptions,
    currentModelsArray,
    currentTypeLabel,
    channelTypeOptions,
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
    ...channelModelDiagnostics,

    ...channelCredentialActions,

    ...channelModelSelection,

    ...channelSubmission,

    ...channelNavigation,

    handleOpenChange,
  }
}
