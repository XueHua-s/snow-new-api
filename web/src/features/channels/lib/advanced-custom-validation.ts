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
  AdvancedCustomRouteAuth,
} from '../types'
import {
  normalizeAdvancedCustomRouteModels,
  getAdvancedCustomModelRuleKind,
  getAdvancedCustomRegexModelPattern,
} from './advanced-custom-model-rules'
import {
  normalizeAdvancedCustomConfig,
  getAdvancedCustomRouteUpstreamPath,
  isAdvancedCustomManagementPath,
} from './advanced-custom-normalization'
import {
  type AdvancedCustomValidationError,
  ADVANCED_CUSTOM_MODEL_LIST_PATH,
  ADVANCED_CUSTOM_CONVERTER_OPTIONS,
} from './advanced-custom-options'

export function validateAdvancedCustomConfig(
  config: AdvancedCustomConfig | null
): AdvancedCustomValidationError | null {
  if (!config) {
    return { message: 'Advanced custom configuration is required' }
  }

  const normalized = normalizeAdvancedCustomConfig(config)
  const routes = normalized.advanced_routes || []
  if (routes.length === 0) {
    return {
      message: 'Advanced custom configuration requires at least one route',
    }
  }

  const routeModelsByPath = new Map<
    string,
    { catchAllIndex: number | null; models: Map<string, number> }
  >()
  let modelListRouteIndex: number | null = null
  let balanceRouteIndex: number | null = null
  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index]
    const incomingPath = route.incoming_path?.trim() || ''
    const upstreamPath = getAdvancedCustomRouteUpstreamPath(route)
    const converter = route.converter || 'none'
    const routeModels = normalizeAdvancedCustomRouteModels(route.models)

    if (!incomingPath) {
      return { routeIndex: index, message: 'Incoming path is required' }
    }
    if (!incomingPath.startsWith('/')) {
      return { routeIndex: index, message: 'Incoming path must start with /' }
    }
    if (incomingPath.includes('?')) {
      return {
        routeIndex: index,
        message: 'Incoming path must not include query',
      }
    }
    if (isAdvancedCustomManagementPath(incomingPath)) {
      const isModelListRoute = incomingPath === ADVANCED_CUSTOM_MODEL_LIST_PATH
      const existingIndex = isModelListRoute
        ? modelListRouteIndex
        : balanceRouteIndex
      const routeLabel = isModelListRoute ? 'OpenAI Models' : 'Balance Query'
      if (existingIndex !== null) {
        return {
          routeIndex: index,
          message: `Only one ${routeLabel} route is allowed`,
        }
      }
      if (isModelListRoute) modelListRouteIndex = index
      else balanceRouteIndex = index
      if (routeModels.length > 0) {
        return {
          routeIndex: index,
          message: `${routeLabel} route does not support client model rules`,
        }
      }
      if (converter !== 'none') {
        return {
          routeIndex: index,
          message: `${routeLabel} route must use native forwarding`,
        }
      }
      if (upstreamPath.includes('{model}')) {
        return {
          routeIndex: index,
          message: `${routeLabel} upstream path must not contain {model}`,
        }
      }
    }
    const routeModelsError = validateAdvancedCustomRouteModels(
      index,
      incomingPath,
      routeModels,
      routeModelsByPath
    )
    if (routeModelsError) {
      return routeModelsError
    }

    if (!upstreamPath) {
      return { routeIndex: index, message: 'Upstream path is required' }
    }
    if (!isFullHttpURLOrAbsolutePath(upstreamPath)) {
      return {
        routeIndex: index,
        message: 'Upstream path must be a full URL or a path starting with /',
      }
    }
    if (!isAdvancedCustomConverter(converter)) {
      return { routeIndex: index, message: 'Converter is not registered' }
    }
    if (!isConverterPathAllowed(incomingPath, converter)) {
      return {
        routeIndex: index,
        message: 'Converter does not match incoming path',
      }
    }

    const authError = validateRouteAuth(route.auth)
    if (authError) {
      return { routeIndex: index, message: authError }
    }
  }

  return null
}

function validateAdvancedCustomRouteModels(
  routeIndex: number,
  incomingPath: string,
  models: string[],
  routeModelsByPath: Map<
    string,
    { catchAllIndex: number | null; models: Map<string, number> }
  >
): AdvancedCustomValidationError | null {
  let state = routeModelsByPath.get(incomingPath)
  if (!state) {
    state = { catchAllIndex: null, models: new Map<string, number>() }
    routeModelsByPath.set(incomingPath, state)
  }

  if (models.length === 0) {
    if (state.catchAllIndex !== null) {
      return {
        routeIndex,
        message:
          'Only one catch-all route is allowed for the same incoming path',
      }
    }
    state.catchAllIndex = routeIndex
    return null
  }

  if (state.catchAllIndex !== null) {
    return {
      routeIndex,
      message: 'Catch-all route must be last for the same incoming path',
    }
  }

  const seenInRoute = new Set<string>()
  for (const model of models) {
    if (
      getAdvancedCustomModelRuleKind(model) === 'regex' &&
      getAdvancedCustomRegexModelPattern(model) === ''
    ) {
      return { routeIndex, message: 'Model regex cannot be empty' }
    }
    if (seenInRoute.has(model)) {
      return { routeIndex, message: 'Duplicate model in route models' }
    }
    seenInRoute.add(model)
    if (state.models.has(model)) {
      return {
        routeIndex,
        message: 'Route models must be unique for the same incoming path',
      }
    }
    state.models.set(model, routeIndex)
  }
  return null
}

function isFullHttpURLOrAbsolutePath(value: string): boolean {
  if (value.startsWith('/')) return !value.startsWith('//')

  try {
    const parsed = new URL(value)
    return (
      Boolean(parsed.host) &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    )
  } catch {
    return false
  }
}

function isAdvancedCustomConverter(
  value: string
): value is AdvancedCustomConverter {
  return ADVANCED_CUSTOM_CONVERTER_OPTIONS.some(
    (option) => option.value === value
  )
}

export function isConverterPathAllowed(
  incomingPath: string,
  converter: AdvancedCustomConverter
): boolean {
  if (converter === 'none') return true
  if (incomingPath === '/v1/alpha/search') return false
  if (converter === 'anthropic_messages_to_openai_chat_completions') {
    return incomingPath === '/v1/messages'
  }
  if (
    converter === 'openai_chat_completions_to_anthropic_messages' ||
    converter === 'openai_chat_completions_to_openai_responses' ||
    converter === 'openai_chat_completions_to_gemini_generate_content'
  ) {
    return incomingPath === '/v1/chat/completions'
  }
  if (converter === 'openai_responses_to_openai_chat_completions') {
    return incomingPath === '/v1/responses'
  }
  if (converter === 'openai_responses_to_gemini_generate_content') {
    return incomingPath === '/v1/responses'
  }
  return (
    incomingPath.includes(':generateContent') ||
    incomingPath.includes(':streamGenerateContent')
  )
}

function validateRouteAuth(
  auth: AdvancedCustomRouteAuth | undefined
): string | null {
  if (!auth) return null
  if (auth.type === 'none') return null
  if (auth.type !== 'header' && auth.type !== 'query') {
    return 'Auth type is invalid'
  }
  if (!auth.name?.trim()) {
    return 'Auth name is required'
  }
  if (!auth.value?.trim()) {
    return 'Auth value is required'
  }
  return null
}

export {
  ADVANCED_CUSTOM_MODEL_REGEX_PREFIX,
  type AdvancedCustomModelRuleKind,
  parseAdvancedCustomRouteModels,
  getAdvancedCustomModelRuleKind,
  getAdvancedCustomRegexModelPattern,
  normalizeAdvancedCustomRouteModels,
} from './advanced-custom-model-rules'
