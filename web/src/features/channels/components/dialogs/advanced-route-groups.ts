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
import type { AdvancedCustomRoute } from '../../types'

export const emptyAdvancedRoutes: AdvancedCustomRoute[] = []

export type AdvancedCustomRouteRow = {
  route: AdvancedCustomRoute
  routeKey: string
  index: number
}

export type AdvancedCustomRouteGroup = {
  incomingPath: string
  routeRows: AdvancedCustomRouteRow[]
}

export function getOptionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string
) {
  return options.find((option) => option.value === value)?.label || value
}

export function getRouteIncomingPath(route: AdvancedCustomRoute): string {
  return (route.incoming_path || '').trim()
}

export function isCatchAllRoute(route: AdvancedCustomRoute): boolean {
  return !route.models || route.models.length === 0
}

export function buildRouteGroups(
  routeRows: AdvancedCustomRouteRow[]
): AdvancedCustomRouteGroup[] {
  const groups: AdvancedCustomRouteGroup[] = []
  const groupByPath = new Map<string, AdvancedCustomRouteGroup>()

  for (const routeRow of routeRows) {
    const incomingPath = getRouteIncomingPath(routeRow.route)
    let group = groupByPath.get(incomingPath)
    if (!group) {
      group = { incomingPath, routeRows: [] }
      groupByPath.set(incomingPath, group)
      groups.push(group)
    }
    group.routeRows.push(routeRow)
  }

  return groups
}
