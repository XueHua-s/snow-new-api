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
import { useEffect, useState, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import {
  useSystemOptions,
  getOptionValue,
} from '@/features/system-settings/hooks/use-system-options'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import type { ModelSettings } from '@/features/system-settings/types'

import { getModel, getVendors } from '../../api'
import { ENDPOINT_TEMPLATES } from '../../constants'
import { modelsQueryKeys, vendorsQueryKeys, parseModelTags } from '../../lib'
import type { Model } from '../../types'
import {
  type PricingMode,
  type PricingSubMode,
  readPricingConfig,
} from './model-mutate-pricing'
import { useModelPricingSubmit } from './use-model-pricing-submit'

// Extended schema for ratio configuration (internal form state only)
const extendedModelFormSchema = z.object({
  id: z.number().optional(),
  model_name: z.string().min(1, 'Model name is required'),
  description: z.string(),
  icon: z.string(),
  tags: z.array(z.string()),
  vendor_id: z.number().optional(),
  endpoints: z.string(),
  name_rule: z.number(),
  status: z.boolean(),
  sync_official: z.boolean(),
  price: z.string().optional(),
  ratio: z.string().optional(),
  cacheRatio: z.string().optional(),
  completionRatio: z.string().optional(),
  imageRatio: z.string().optional(),
  audioRatio: z.string().optional(),
  audioCompletionRatio: z.string().optional(),
})

export type ExtendedModelFormValues = z.infer<typeof extendedModelFormSchema>

export type ModelMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Model | null
}

export function useModelMutateForm({
  open,
  onOpenChange,
  currentRow,
}: ModelMutateDrawerProps) {
  const queryClient = useQueryClient()
  const currentModelId = currentRow?.id
  const isEditing = Boolean(currentModelId)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pricingMode, setPricingMode] = useState<PricingMode>('per-token')
  const [pricingSubMode, setPricingSubMode] = useState<PricingSubMode>('ratio')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [promptPrice, setPromptPrice] = useState('')
  const [completionPrice, setCompletionPrice] = useState('')
  const [oldModelName, setOldModelName] = useState<string>('')
  // Model name whose pricing was read into the form when the drawer opened.
  // Submit may only rewrite pricing for this name, or for a name the user
  // explicitly priced; anything else it never saw and must leave alone.
  const [loadedPricingName, setLoadedPricingName] = useState<string>('')
  // Keep a ref so the load effect can read the latest modelSettings without
  // depending on it: modelSettings is a fresh object on every system-options
  // refetch, and including it in the deps would reset the form under the user.
  const modelSettingsRef = useRef<ModelSettings | null>(null)

  // Fetch vendors for dropdown
  const { data: vendorsData } = useQuery({
    queryKey: vendorsQueryKeys.list(),
    queryFn: () => getVendors({ page_size: 1000 }),
    enabled: open,
  })

  const vendors = vendorsData?.data?.items || []

  // Fetch model detail if editing
  const { data: modelData } = useQuery({
    queryKey: modelsQueryKeys.detail(currentModelId || 0),
    queryFn: () => {
      if (!currentModelId) {
        throw new Error('Model ID is required')
      }
      return getModel(currentModelId)
    },
    enabled: open && isEditing,
  })

  // Fetch system options for ratio configuration
  const { data: systemOptionsData } = useSystemOptions()

  const updateOption = useUpdateOption()

  // Get model settings from system options
  const modelSettings = useMemo(() => {
    if (!systemOptionsData?.data) return null
    const defaultModelSettings: ModelSettings = {
      'global.pass_through_request_enabled': false,
      'global.thinking_model_blacklist': '[]',
      'global.chat_completions_to_responses_policy': '{}',
      'general_setting.ping_interval_enabled': false,
      'general_setting.ping_interval_seconds': 60,
      'gemini.safety_settings': '',
      'gemini.version_settings': '',
      'gemini.supported_imagine_models': '',
      'gemini.thinking_adapter_enabled': false,
      'gemini.thinking_adapter_budget_tokens_percentage': 0.6,
      'gemini.function_call_thought_signature_enabled': false,
      'gemini.remove_function_response_id_enabled': true,
      'claude.model_headers_settings': '',
      'claude.default_max_tokens': '',
      'claude.thinking_adapter_enabled': true,
      'claude.thinking_adapter_budget_tokens_percentage': 0.8,
      ModelPrice: '',
      ModelRatio: '',
      CacheRatio: '',
      CompletionRatio: '',
      ImageRatio: '',
      AudioRatio: '',
      AudioCompletionRatio: '',
      ExposeRatioEnabled: false,
      'billing_setting.billing_mode': '{}',
      'billing_setting.billing_expr': '{}',
      'tool_price_setting.prices': '{}',
      TopupGroupRatio: '',
      GroupRatio: '',
      UserUsableGroups: '',
      GroupGroupRatio: '',
      AutoGroups: '',
      MaxTokenAutoGroups: 5,
      DefaultUseAutoGroup: false,
      CreateCacheRatio: '',
      'group_ratio_setting.group_special_usable_group': '{}',
      'grok.violation_deduction_enabled': false,
      'grok.violation_deduction_amount': 0,
      RetryTimes: 0,
      ChannelDisableThreshold: '',
      AutomaticDisableChannelEnabled: false,
      AutomaticEnableChannelEnabled: false,
      AutomaticDisableKeywords: '',
      AutomaticDisableStatusCodes: '401',
      AutomaticRetryStatusCodes:
        '100-199,300-399,401-407,409-499,500-503,505-523,525-599',
      'monitor_setting.auto_test_channel_enabled': false,
      'monitor_setting.auto_test_channel_minutes': 10,
      'monitor_setting.channel_test_concurrency': 1,
      'monitor_setting.channel_test_mode': 'scheduled_all',
      'channel_affinity_setting.enabled': false,
      'channel_affinity_setting.switch_on_success': true,
      'channel_affinity_setting.keep_on_channel_disabled': false,
      'channel_affinity_setting.max_entries': 100000,
      'channel_affinity_setting.default_ttl_seconds': 3600,
      'channel_affinity_setting.rules': '[]',
      'model_deployment.ionet.api_key': '',
      'model_deployment.ionet.enabled': false,
    }
    return getOptionValue(systemOptionsData.data, defaultModelSettings)
  }, [systemOptionsData])

  // The load effect keys off this boolean, not the object: it re-runs once
  // when the settings first arrive (so a drawer opened before that still gets
  // its pricing prefilled), while later refetches only produce a new object
  // reference and must not reset a form the user may be editing.
  const hasModelSettings = modelSettings !== null
  useEffect(() => {
    modelSettingsRef.current = modelSettings
  })

  const form = useForm<ExtendedModelFormValues>({
    resolver: zodResolver(extendedModelFormSchema),
    defaultValues: {
      model_name: '',
      description: '',
      icon: '',
      tags: [],
      vendor_id: undefined,
      endpoints: '',
      name_rule: 0,
      status: true,
      sync_official: true,
      price: '',
      ratio: '',
      cacheRatio: '',
      completionRatio: '',
      imageRatio: '',
      audioRatio: '',
      audioCompletionRatio: '',
    },
  })

  const validateNumber = (value: string) => {
    if (value === '') return true
    return !Number.isNaN(Number.parseFloat(value))
  }

  const handlePromptPriceChange = (value: string) => {
    setPromptPrice(value)
    if (value && !Number.isNaN(Number.parseFloat(value))) {
      const ratio = Number.parseFloat(value) / 2
      form.setValue('ratio', ratio.toString())
    } else {
      form.setValue('ratio', '')
    }
  }

  const handleCompletionPriceChange = (value: string) => {
    setCompletionPrice(value)
    if (
      value &&
      !Number.isNaN(Number.parseFloat(value)) &&
      promptPrice &&
      !Number.isNaN(Number.parseFloat(promptPrice)) &&
      Number.parseFloat(promptPrice) > 0
    ) {
      const completionRatio =
        Number.parseFloat(value) / Number.parseFloat(promptPrice)
      form.setValue('completionRatio', completionRatio.toString())
    } else {
      form.setValue('completionRatio', '')
    }
  }

  // Load model data for editing and ratio configuration
  useEffect(() => {
    if (open && isEditing && modelData?.data) {
      const model = modelData.data
      setOldModelName(model.model_name)

      const pricing = readPricingConfig(
        modelSettingsRef.current,
        model.model_name
      )
      setLoadedPricingName(model.model_name)
      setPricingMode(pricing.mode)
      setPromptPrice(pricing.promptPrice)
      setCompletionPrice(pricing.completionPrice)
      setAdvancedOpen(pricing.advancedOpen)
      form.reset({
        id: model.id,
        model_name: model.model_name,
        description: model.description || '',
        icon: model.icon || '',
        tags: parseModelTags(model.tags),
        vendor_id: model.vendor_id,
        endpoints: model.endpoints || '',
        name_rule: model.name_rule || 0,
        status: model.status === 1,
        sync_official: model.sync_official === 1,
        ...pricing.fields,
      })
    } else if (open && !isEditing) {
      // Pre-fill model name if passed from missing models, along with any
      // pricing that name already has, so the user edits it instead of being
      // shown an empty form that hides existing configuration.
      const modelName = currentRow?.model_name || ''
      const pricing = readPricingConfig(modelSettingsRef.current, modelName)
      setOldModelName('')
      setLoadedPricingName(modelName)
      setPricingSubMode('ratio')
      setPricingMode(pricing.mode)
      setPromptPrice(pricing.promptPrice)
      setCompletionPrice(pricing.completionPrice)
      setAdvancedOpen(pricing.advancedOpen)
      form.reset({
        model_name: modelName,
        description: '',
        icon: '',
        tags: [],
        vendor_id: undefined,
        endpoints: '',
        name_rule: 0,
        status: true,
        sync_official: true,
        ...pricing.fields,
      })
    }
  }, [open, isEditing, modelData, currentRow, form, hasModelSettings])

  const { onSubmit } = useModelPricingSubmit({
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
  })

  const handleFillEndpointTemplate = (templateKey: string) => {
    const template = ENDPOINT_TEMPLATES[templateKey]
    if (template) {
      const templateJson = JSON.stringify({ [templateKey]: template }, null, 2)
      form.setValue('endpoints', templateJson)
    }
  }

  return {
    isEditing,
    isSubmitting,
    pricingMode,
    setPricingMode,
    pricingSubMode,
    setPricingSubMode,
    advancedOpen,
    setAdvancedOpen,
    promptPrice,
    setPromptPrice,
    completionPrice,
    setCompletionPrice,
    vendors,
    form,
    validateNumber,
    handlePromptPriceChange,
    handleCompletionPriceChange,
    onSubmit,
    handleFillEndpointTemplate,
  }
}
