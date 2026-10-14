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
import type {
  AdvancedCustomAuthType,
  AdvancedCustomConfig,
  AdvancedCustomConverter,
  AdvancedCustomRouteAuth,
} from '../types'

export const CHANNEL_TYPE_ADVANCED_CUSTOM = 58

export const ADVANCED_CUSTOM_MODEL_LIST_PATH = '/v1/models'

export const ADVANCED_CUSTOM_MODEL_LIST_LABEL = 'OpenAI Models'

export const ADVANCED_CUSTOM_BALANCE_PATH =
  '/v1/dashboard/billing/credit_grants'

export const ADVANCED_CUSTOM_BALANCE_LABEL = 'Balance Query'

export const ADVANCED_CUSTOM_CONVERTER_OPTIONS: Array<{
  value: AdvancedCustomConverter
  label: string
  triggerLabel: string
}> = [
  {
    value: 'none',
    label: 'Native forwarding',
    triggerLabel: 'Native forwarding',
  },
  {
    value: 'anthropic_messages_to_openai_chat_completions',
    label: 'Anthropic Messages to OpenAI Chat',
    triggerLabel: 'To OpenAI Chat',
  },
  {
    value: 'openai_chat_completions_to_anthropic_messages',
    label: 'OpenAI Chat to Anthropic Messages',
    triggerLabel: 'To Anthropic Messages',
  },
  {
    value: 'openai_chat_completions_to_openai_responses',
    label: 'OpenAI Chat to OpenAI Responses',
    triggerLabel: 'To OpenAI Responses',
  },
  {
    value: 'openai_responses_to_openai_chat_completions',
    label: 'OpenAI Responses to OpenAI Chat',
    triggerLabel: 'To OpenAI Chat',
  },
  {
    value: 'openai_responses_to_gemini_generate_content',
    label: 'OpenAI Responses to Gemini Generate Content',
    triggerLabel: 'To Gemini Generate Content',
  },
  {
    value: 'gemini_generate_content_to_openai_chat_completions',
    label: 'Gemini Generate Content to OpenAI Chat',
    triggerLabel: 'To OpenAI Chat',
  },
  {
    value: 'openai_chat_completions_to_gemini_generate_content',
    label: 'OpenAI Chat to Gemini Generate Content',
    triggerLabel: 'To Gemini Generate Content',
  },
]

export type AdvancedCustomAuthMode = 'default' | AdvancedCustomAuthType

export const ADVANCED_CUSTOM_AUTH_MODE_OPTIONS: Array<{
  value: AdvancedCustomAuthMode
  label: string
}> = [
  { value: 'default', label: 'Default Bearer' },
  { value: 'none', label: 'No Auth' },
  { value: 'header', label: 'Header' },
  { value: 'query', label: 'Query' },
]

export type AdvancedCustomIncomingPathOption = {
  value: string
  /** Official API route name. Render verbatim instead of passing it to i18n. */
  label: string
}

export const ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS: AdvancedCustomIncomingPathOption[] =
  [
    {
      value: '/v1/chat/completions',
      label: 'OpenAI Chat',
    },
    {
      value: '/v1/responses',
      label: 'OpenAI Responses',
    },
    {
      value: '/v1/responses/compact',
      label: 'OpenAI Responses Compact',
    },
    {
      value: '/v1/alpha/search',
      label: 'Codex Alpha Search',
    },
    {
      value: '/v1/embeddings',
      label: 'OpenAI Embeddings',
    },
    {
      value: '/v1/images/generations',
      label: 'OpenAI Image Generations',
    },
    {
      value: '/v1/images/edits',
      label: 'OpenAI Image Edits',
    },
    {
      value: '/v1/completions',
      label: 'OpenAI Completions',
    },
    {
      value: '/v1/audio/speech',
      label: 'OpenAI Audio Speech',
    },
    {
      value: '/v1/audio/transcriptions',
      label: 'OpenAI Audio Transcriptions',
    },
    {
      value: '/v1/audio/translations',
      label: 'OpenAI Audio Translations',
    },
    {
      value: '/v1/rerank',
      label: 'Rerank',
    },
    {
      value: '/v1/realtime',
      label: 'OpenAI Realtime',
    },
    {
      value: '/v1/messages',
      label: 'Claude Messages',
    },
    {
      value: '/v1beta/models/{model}:generateContent',
      label: 'Gemini Generate Content',
    },
    {
      value: '/v1beta/models/{model}:embedContent',
      label: 'Gemini Embed Content',
    },
    {
      value: '/v1beta/models/{model}:batchEmbedContents',
      label: 'Gemini Batch Embed Contents',
    },
  ]

export const ADVANCED_CUSTOM_ROUTE_SUMMARY_LABELS: Record<string, string> = {
  '/v1/chat/completions': 'OpenAI Chat',
  [ADVANCED_CUSTOM_MODEL_LIST_PATH]: ADVANCED_CUSTOM_MODEL_LIST_LABEL,
  [ADVANCED_CUSTOM_BALANCE_PATH]: ADVANCED_CUSTOM_BALANCE_LABEL,
}

export type AdvancedCustomValidationError = {
  message: string
  routeIndex?: number
}

export type AdvancedCustomTemplateOption = {
  value: string
  label: string
  config: AdvancedCustomConfig
}

export type AdvancedCustomConverterDefaults = {
  upstream_path: string
  auth?: AdvancedCustomRouteAuth
}

export const openAIChatPath = '/v1/chat/completions'

export const openAIResponsesPath = '/v1/responses'

export const claudeMessagesPath = '/v1/messages'

export const geminiGenerateContentPath =
  '/v1beta/models/{model}:generateContent'

export const bearerHeaderAuth = (): AdvancedCustomRouteAuth => ({
  type: 'header',
  name: 'Authorization',
  value: 'Bearer {api_key}',
})

export const apiKeyHeaderAuth = (): AdvancedCustomRouteAuth => ({
  type: 'header',
  name: 'x-api-key',
  value: '{api_key}',
})

export const geminiQueryAuth = (): AdvancedCustomRouteAuth => ({
  type: 'query',
  name: 'key',
  value: '{api_key}',
})
