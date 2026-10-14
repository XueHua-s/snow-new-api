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
import { isAdvancedCustomManagementPath } from '../../lib/advanced-custom-normalization'
import type { AdvancedCustomRoute } from '../../types'
import {
  getRouteIncomingPath,
  type AdvancedCustomRouteRow,
  isCatchAllRoute,
} from './advanced-route-groups'

export function orderAdvancedCustomCatchAllRoutes(
  routeRows: AdvancedCustomRouteRow[],
  routes: AdvancedCustomRoute[],
  allRouteRows: AdvancedCustomRouteRow[]
) {
  const routeRowsByPath = new Map<string, AdvancedCustomRouteRow[]>()
  for (const routeRow of routeRows) {
    const incomingPath = getRouteIncomingPath(routeRow.route)
    routeRowsByPath.set(incomingPath, [
      ...(routeRowsByPath.get(incomingPath) || []),
      routeRow,
    ])
  }

  const orderedRowsByPath = new Map<string, AdvancedCustomRouteRow[]>()
  for (const [incomingPath, rows] of routeRowsByPath) {
    orderedRowsByPath.set(incomingPath, [
      ...rows.filter((routeRow) => !isCatchAllRoute(routeRow.route)),
      ...rows.filter((routeRow) => isCatchAllRoute(routeRow.route)),
    ])
  }

  const nextRows = routeRows.map((routeRow) => {
    const incomingPath = getRouteIncomingPath(routeRow.route)
    const orderedRows = orderedRowsByPath.get(incomingPath)
    return orderedRows?.shift() || routeRow
  })
  const orderedRoutes = [...nextRows]
  const orderedRouteKeys = [...nextRows]
  return [
    routes.map((route) =>
      isAdvancedCustomManagementPath(getRouteIncomingPath(route))
        ? route
        : orderedRoutes.shift()?.route || route
    ),
    allRouteRows.map((routeRow) =>
      isAdvancedCustomManagementPath(getRouteIncomingPath(routeRow.route))
        ? routeRow.routeKey
        : orderedRouteKeys.shift()?.routeKey || routeRow.routeKey
    ),
  ] as const
}
