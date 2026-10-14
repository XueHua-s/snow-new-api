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
import { normalizeAdvancedCustomRouteModels } from './advanced-custom-model-rules'
import {
  ADVANCED_CUSTOM_MODEL_LIST_PATH,
  ADVANCED_CUSTOM_BALANCE_PATH,
} from './advanced-custom-options'

export function isAdvancedCustomManagementPath(path: string): boolean {
  return (
    path === ADVANCED_CUSTOM_MODEL_LIST_PATH ||
    path === ADVANCED_CUSTOM_BALANCE_PATH
  )
}

export function normalizeAdvancedCustomConfig(
  config: AdvancedCustomConfig
): AdvancedCustomConfig {
  const routes = Array.isArray(config.advanced_routes)
    ? config.advanced_routes.map(normalizeAdvancedCustomRoute)
    : []

  return {
    advanced_routes: routes,
  }
}

function normalizeAdvancedCustomRoute(
  route: AdvancedCustomRoute
): AdvancedCustomRoute {
  const nextRoute: AdvancedCustomRoute = {
    incoming_path: route.incoming_path || '',
    upstream_path: getAdvancedCustomRouteUpstreamPath(route),
    converter: route.converter || 'none',
  }
  const models = normalizeAdvancedCustomRouteModels(route.models)
  if (models.length > 0) {
    nextRoute.models = models
  }
  if (route.auth) {
    nextRoute.auth = {
      type: route.auth.type,
      name: route.auth.name || '',
      value: route.auth.value || '',
    }
  }
  return nextRoute
}

export function getAdvancedCustomRouteUpstreamPath(
  route: AdvancedCustomRoute
): string {
  return (route.upstream_path || '').trim()
}
