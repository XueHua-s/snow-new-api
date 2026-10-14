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
  AdvancedCustomConfig,
  AdvancedCustomConverter,
  AdvancedCustomRoute,
  AdvancedCustomRouteAuth,
} from '../types'
import {
  normalizeAdvancedCustomConfig,
  isAdvancedCustomManagementPath,
  getAdvancedCustomRouteUpstreamPath,
} from './advanced-custom-normalization'
import {
  ADVANCED_CUSTOM_MODEL_LIST_PATH,
  openAIChatPath,
  type AdvancedCustomConverterDefaults,
  bearerHeaderAuth,
  openAIResponsesPath,
  claudeMessagesPath,
  apiKeyHeaderAuth,
  geminiGenerateContentPath,
  geminiQueryAuth,
  type AdvancedCustomIncomingPathOption,
  ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS,
  ADVANCED_CUSTOM_CONVERTER_OPTIONS,
  type AdvancedCustomAuthMode,
  ADVANCED_CUSTOM_ROUTE_SUMMARY_LABELS,
} from './advanced-custom-options'
import {
  isConverterPathAllowed,
  validateAdvancedCustomConfig,
} from './advanced-custom-validation'

export function getAdvancedCustomManagementRoute(
  config: AdvancedCustomConfig,
  path: string
): AdvancedCustomRoute | undefined {
  return normalizeAdvancedCustomConfig(config).advanced_routes?.find(
    (route) => route.incoming_path?.trim() === path
  )
}

export function replaceAdvancedCustomManagementRoute(
  config: AdvancedCustomConfig,
  path: string,
  route: AdvancedCustomRoute | null
): AdvancedCustomConfig {
  const normalized = normalizeAdvancedCustomConfig(config)
  const routes = [...(normalized.advanced_routes || [])]
  const index = routes.findIndex(
    (candidate) => candidate.incoming_path?.trim() === path
  )
  if (route === null) {
    if (index >= 0) routes.splice(index, 1)
  } else {
    const managementRoute: AdvancedCustomRoute = {
      incoming_path: path,
      upstream_path: route.upstream_path || '',
      converter: 'none',
      models: [],
      auth: route.auth,
    }
    if (index >= 0) routes[index] = managementRoute
    else routes.push(managementRoute)
  }
  return { advanced_routes: routes }
}

export function replaceAdvancedCustomForwardingRoutes(
  config: AdvancedCustomConfig,
  forwardingRoutes: AdvancedCustomRoute[]
): AdvancedCustomConfig {
  const normalized = normalizeAdvancedCustomConfig(config)
  const routes = normalized.advanced_routes || []
  const firstForwardingIndex = routes.findIndex(
    (route) =>
      !isAdvancedCustomManagementPath(route.incoming_path?.trim() || '')
  )
  const managementRoutes = routes.filter((route) =>
    isAdvancedCustomManagementPath(route.incoming_path?.trim() || '')
  )
  if (firstForwardingIndex < 0) {
    return { advanced_routes: [...managementRoutes, ...forwardingRoutes] }
  }

  const before = routes
    .slice(0, firstForwardingIndex)
    .filter((route) =>
      isAdvancedCustomManagementPath(route.incoming_path?.trim() || '')
    )
  const after = routes
    .slice(firstForwardingIndex)
    .filter((route) =>
      isAdvancedCustomManagementPath(route.incoming_path?.trim() || '')
    )
  return { advanced_routes: [...before, ...forwardingRoutes, ...after] }
}

export function createAdvancedCustomRoute(): AdvancedCustomRoute {
  return {
    incoming_path: openAIChatPath,
    upstream_path: openAIChatPath,
    converter: 'none',
  }
}

export function createAdvancedCustomConfig(): AdvancedCustomConfig {
  return {
    advanced_routes: [createAdvancedCustomRoute()],
  }
}

export function createAdvancedCustomManagementRoute(
  path: string
): AdvancedCustomRoute {
  return {
    incoming_path: path,
    upstream_path: path,
    converter: 'none',
    models: [],
  }
}

export function getAdvancedCustomUpstreamPathPlaceholder(
  converter: AdvancedCustomConverter,
  incomingPath = getDefaultAdvancedCustomIncomingPath(converter)
): string {
  return getAdvancedCustomConverterDefaults(converter, incomingPath)
    .upstream_path
}

export function getAdvancedCustomConverterDefaults(
  converter: AdvancedCustomConverter,
  incomingPath: string
): AdvancedCustomConverterDefaults {
  const normalizedIncomingPath =
    incomingPath.trim() || getDefaultAdvancedCustomIncomingPath(converter)

  if (converter === 'none') {
    return {
      upstream_path: normalizedIncomingPath,
      auth: getAdvancedCustomNativeAuth(normalizedIncomingPath),
    }
  }
  if (
    converter === 'anthropic_messages_to_openai_chat_completions' ||
    converter === 'gemini_generate_content_to_openai_chat_completions' ||
    converter === 'openai_responses_to_openai_chat_completions'
  ) {
    return { upstream_path: openAIChatPath, auth: bearerHeaderAuth() }
  }
  if (converter === 'openai_chat_completions_to_openai_responses') {
    return { upstream_path: openAIResponsesPath, auth: bearerHeaderAuth() }
  }
  if (converter === 'openai_chat_completions_to_anthropic_messages') {
    return { upstream_path: claudeMessagesPath, auth: apiKeyHeaderAuth() }
  }
  if (
    converter === 'openai_chat_completions_to_gemini_generate_content' ||
    converter === 'openai_responses_to_gemini_generate_content'
  ) {
    return { upstream_path: geminiGenerateContentPath, auth: geminiQueryAuth() }
  }

  return {
    upstream_path: normalizedIncomingPath || openAIChatPath,
    auth: getAdvancedCustomNativeAuth(normalizedIncomingPath),
  }
}

function getAdvancedCustomNativeAuth(
  incomingPath: string
): AdvancedCustomRouteAuth {
  if (incomingPath === claudeMessagesPath) {
    return apiKeyHeaderAuth()
  }
  if (
    incomingPath.includes(':generateContent') ||
    incomingPath.includes(':streamGenerateContent') ||
    incomingPath.includes(':embedContent') ||
    incomingPath.includes(':batchEmbedContents')
  ) {
    return geminiQueryAuth()
  }
  return bearerHeaderAuth()
}

export function getAdvancedCustomIncomingPathOptions(
  converter: AdvancedCustomConverter
): AdvancedCustomIncomingPathOption[] {
  return ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS.filter((option) =>
    isConverterPathAllowed(option.value, converter)
  )
}

export function getDefaultAdvancedCustomIncomingPath(
  converter: AdvancedCustomConverter
): string {
  return (
    getAdvancedCustomIncomingPathOptions(converter)[0]?.value ||
    '/v1/chat/completions'
  )
}

export function isAdvancedCustomIncomingPathAllowed(
  incomingPath: string,
  converter: AdvancedCustomConverter
): boolean {
  return isConverterPathAllowed(incomingPath, converter)
}

export function getAdvancedCustomConverterOptions(
  incomingPath: string
): typeof ADVANCED_CUSTOM_CONVERTER_OPTIONS {
  const normalizedIncomingPath = incomingPath.trim()
  return ADVANCED_CUSTOM_CONVERTER_OPTIONS.filter(
    (option) =>
      option.value === 'none' ||
      isConverterPathAllowed(normalizedIncomingPath, option.value)
  )
}

export function getAdvancedCustomIncomingPathLabel(value: string): string {
  return (
    ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS.find(
      (option) => option.value === value
    )?.label || value
  )
}

export function parseAdvancedCustomConfig(
  value: string | undefined
): AdvancedCustomConfig | null {
  if (!value?.trim()) return null
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return normalizeAdvancedCustomConfig(parsed as AdvancedCustomConfig)
  } catch {
    return null
  }
}

export function stringifyAdvancedCustomConfig(
  config: AdvancedCustomConfig
): string {
  return JSON.stringify(normalizeAdvancedCustomConfig(config), null, 2)
}

export function hasValidAdvancedCustomModelListRoute(
  config: AdvancedCustomConfig | null
): boolean {
  if (!config || validateAdvancedCustomConfig(config)) return false
  const normalized = normalizeAdvancedCustomConfig(config)
  return (normalized.advanced_routes || []).some(
    (route) => route.incoming_path?.trim() === ADVANCED_CUSTOM_MODEL_LIST_PATH
  )
}

export function advancedCustomConfigUsesRelativeUpstreamPath(
  config: AdvancedCustomConfig | null
): boolean {
  if (!config) return false
  const normalized = normalizeAdvancedCustomConfig(config)
  return (normalized.advanced_routes || []).some((route) =>
    getAdvancedCustomRouteUpstreamPath(route).startsWith('/')
  )
}

export function getAdvancedCustomStats(value: string | undefined): {
  routeCount: number
  valid: boolean
  routeTypeLabels: string[]
} {
  const config = parseAdvancedCustomConfig(value)
  if (!config) {
    return { routeCount: 0, valid: false, routeTypeLabels: [] }
  }
  const normalized = normalizeAdvancedCustomConfig(config)
  const routes = normalized.advanced_routes || []
  const routeTypeLabels: string[] = []
  const seenRouteTypeLabels = new Set<string>()

  for (const route of routes) {
    const label = getAdvancedCustomRouteSummaryLabel(route)
    if (!label || seenRouteTypeLabels.has(label)) continue
    routeTypeLabels.push(label)
    seenRouteTypeLabels.add(label)
  }

  return {
    routeCount: routes.length,
    valid: validateAdvancedCustomConfig(normalized) === null,
    routeTypeLabels,
  }
}

export function getAdvancedCustomAuthMode(
  route: AdvancedCustomRoute
): AdvancedCustomAuthMode {
  return route.auth?.type || 'default'
}

export function buildAdvancedCustomAuth(
  mode: AdvancedCustomAuthMode,
  previousAuth: AdvancedCustomRouteAuth | undefined
): AdvancedCustomRouteAuth | undefined {
  if (mode === 'default') return undefined
  if (mode === 'none') return { type: 'none' }
  if (mode === 'header') {
    return {
      type: 'header',
      name: previousAuth?.name || 'Authorization',
      value: previousAuth?.value || 'Bearer {api_key}',
    }
  }
  return {
    type: 'query',
    name: previousAuth?.name || 'api_key',
    value: previousAuth?.value || '{api_key}',
  }
}

function getAdvancedCustomRouteSummaryLabel(
  route: AdvancedCustomRoute
): string | null {
  const incomingPath = route.incoming_path?.trim() || ''
  if (!incomingPath) return null
  return (
    ADVANCED_CUSTOM_ROUTE_SUMMARY_LABELS[incomingPath] ||
    getAdvancedCustomIncomingPathLabel(incomingPath)
  )
}

export {
  normalizeAdvancedCustomConfig,
  getAdvancedCustomRouteUpstreamPath,
  isAdvancedCustomManagementPath,
} from './advanced-custom-normalization'
export {
  CHANNEL_TYPE_ADVANCED_CUSTOM,
  ADVANCED_CUSTOM_MODEL_LIST_PATH,
  ADVANCED_CUSTOM_MODEL_LIST_LABEL,
  ADVANCED_CUSTOM_BALANCE_PATH,
  ADVANCED_CUSTOM_BALANCE_LABEL,
  ADVANCED_CUSTOM_CONVERTER_OPTIONS,
  type AdvancedCustomAuthMode,
  ADVANCED_CUSTOM_AUTH_MODE_OPTIONS,
  type AdvancedCustomIncomingPathOption,
  ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS,
  type AdvancedCustomValidationError,
  type AdvancedCustomTemplateOption,
  type AdvancedCustomConverterDefaults,
} from './advanced-custom-options'
export {
  ADVANCED_CUSTOM_TEMPLATE_OPTIONS,
  cloneAdvancedCustomConfig,
  getAdvancedCustomTemplateConfig,
} from './advanced-custom-templates'
export {
  ADVANCED_CUSTOM_MODEL_REGEX_PREFIX,
  type AdvancedCustomModelRuleKind,
  validateAdvancedCustomConfig,
  parseAdvancedCustomRouteModels,
  getAdvancedCustomModelRuleKind,
  getAdvancedCustomRegexModelPattern,
} from './advanced-custom-validation'
