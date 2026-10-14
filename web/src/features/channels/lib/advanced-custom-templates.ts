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
import type { AdvancedCustomConfig, AdvancedCustomRoute } from '../types'
import {
  bearerHeaderAuth,
  apiKeyHeaderAuth,
  geminiQueryAuth,
  type AdvancedCustomTemplateOption,
} from './advanced-custom-options'

function createOpenAINativeRoutes(): AdvancedCustomRoute[] {
  return [
    '/v1/chat/completions',
    '/v1/completions',
    '/v1/responses',
    '/v1/responses/compact',
    '/v1/embeddings',
    '/v1/images/generations',
    '/v1/images/edits',
    '/v1/audio/speech',
    '/v1/audio/transcriptions',
    '/v1/audio/translations',
    '/v1/realtime',
  ].map((path) => ({
    incoming_path: path,
    upstream_path: path,
    converter: 'none',
    auth: bearerHeaderAuth(),
  }))
}

function createClaudeNativeRoutes(): AdvancedCustomRoute[] {
  return [
    {
      incoming_path: '/v1/messages',
      upstream_path: '/v1/messages',
      converter: 'none',
      auth: apiKeyHeaderAuth(),
    },
  ]
}

function createGeminiNativeRoutes(): AdvancedCustomRoute[] {
  return [
    '/v1beta/models/{model}:generateContent',
    '/v1beta/models/{model}:embedContent',
    '/v1beta/models/{model}:batchEmbedContents',
  ].map((path) => ({
    incoming_path: path,
    upstream_path: path,
    converter: 'none',
    auth: geminiQueryAuth(),
  }))
}

function createGatewayNativeRoutes(): AdvancedCustomRoute[] {
  return ['/v1/alpha/search', '/v1/rerank'].map((path) => ({
    incoming_path: path,
    upstream_path: path,
    converter: 'none',
    auth: bearerHeaderAuth(),
  }))
}

export const ADVANCED_CUSTOM_TEMPLATE_OPTIONS: AdvancedCustomTemplateOption[] =
  [
    {
      value: 'all_protocols',
      label: 'All routes',
      config: {
        advanced_routes: [
          ...createOpenAINativeRoutes(),
          ...createClaudeNativeRoutes(),
          ...createGeminiNativeRoutes(),
          ...createGatewayNativeRoutes(),
        ],
      },
    },
    {
      value: 'openai_only',
      label: 'OpenAI only',
      config: {
        advanced_routes: createOpenAINativeRoutes(),
      },
    },
    {
      value: 'claude_only',
      label: 'Claude only',
      config: {
        advanced_routes: createClaudeNativeRoutes(),
      },
    },
    {
      value: 'gemini_only',
      label: 'Gemini only',
      config: {
        advanced_routes: createGeminiNativeRoutes(),
      },
    },
  ]

export function cloneAdvancedCustomConfig(
  config: AdvancedCustomConfig
): AdvancedCustomConfig {
  return structuredClone(config)
}

export function getAdvancedCustomTemplateConfig(
  templateKey: string
): AdvancedCustomConfig {
  const template =
    ADVANCED_CUSTOM_TEMPLATE_OPTIONS.find(
      (option) => option.value === templateKey
    ) || ADVANCED_CUSTOM_TEMPLATE_OPTIONS[0]
  return cloneAdvancedCustomConfig(template.config)
}
