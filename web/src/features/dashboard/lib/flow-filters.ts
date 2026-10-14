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
  FlowBuildOptions,
  FlowFilterOptions,
  FlowMetric,
  FlowNodeFilter,
  FlowNodeKind,
  FlowQuotaDataItem,
  FlowRole,
} from '@/features/dashboard/types'

import {
  userNode,
  type FlowPathNode,
  type FlowPathContext,
  flowPathForStages,
  stableColorMap,
  rowMetrics,
  metricValue,
  colorAt,
  resolveVisibleStages,
  NODE_BUILDERS,
  DEFAULT_FLOW_ROLE,
  EMPTY_FLOW_PATH_CONTEXT,
} from './flow-paths'

export function filterRows(
  rows: FlowQuotaDataItem[],
  options: FlowBuildOptions = {}
): FlowQuotaDataItem[] {
  const selectedUsers = new Set(options.selectedUsers ?? [])
  if (selectedUsers.size === 0) return rows
  return rows.filter((row) => selectedUsers.has(userNode(row).id))
}

function nodeFilterKey(filter: FlowNodeFilter): string {
  return `${filter.kind}\u0000${filter.id}`
}

function normalizeSelectedNodeFilters(
  selectedNodes: readonly FlowNodeFilter[] | undefined,
  stages: readonly FlowNodeKind[]
): Map<FlowNodeKind, Set<string>> {
  const visibleKinds = new Set(stages)
  const filters = new Map<FlowNodeKind, Set<string>>()

  for (const filter of selectedNodes ?? []) {
    if (!visibleKinds.has(filter.kind)) continue
    const selected = filters.get(filter.kind) ?? new Set<string>()
    selected.add(filter.id)
    filters.set(filter.kind, selected)
  }

  return filters
}

function pathMatchesNodeFilters(
  path: FlowPathNode[],
  filters: Map<FlowNodeKind, Set<string>>
): boolean {
  if (filters.size === 0) return true

  const pathNodesByKind = new Map<FlowNodeKind, Set<string>>()
  for (const node of path) {
    const ids = pathNodesByKind.get(node.kind) ?? new Set<string>()
    ids.add(node.id)
    pathNodesByKind.set(node.kind, ids)
  }

  for (const [kind, selectedIds] of filters) {
    const pathIds = pathNodesByKind.get(kind)
    if (!pathIds) return false

    let hasSelectedNode = false
    for (const id of selectedIds) {
      if (pathIds.has(id)) {
        hasSelectedNode = true
        break
      }
    }
    if (!hasSelectedNode) return false
  }

  return true
}

export function filterRowsByNodes(
  rows: FlowQuotaDataItem[],
  selectedNodes: readonly FlowNodeFilter[] | undefined,
  stages: FlowNodeKind[],
  ctx: FlowPathContext
): FlowQuotaDataItem[] {
  const filters = normalizeSelectedNodeFilters(selectedNodes, stages)
  if (filters.size === 0) return rows

  return rows.filter((row) =>
    pathMatchesNodeFilters(flowPathForStages(row, stages, ctx), filters)
  )
}

function selectedNodeFiltersExceptKind(
  selectedNodes: readonly FlowNodeFilter[] | undefined,
  kind: FlowNodeKind
): FlowNodeFilter[] | undefined {
  const filtered = (selectedNodes ?? []).filter(
    (filter) => filter.kind !== kind
  )
  return filtered.length > 0 ? filtered : undefined
}

export function formatNumber(value: number): string {
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value
  )
}

export function buildUserFilterOptions(
  rows: FlowQuotaDataItem[],
  metric: FlowMetric = 'quota',
  palette?: readonly string[]
): FlowFilterOptions['users'] {
  const users = new Map<
    string,
    {
      label: string
      value: number
      color: string
    }
  >()
  const colors = stableColorMap(
    rows.map((row) => userNode(row).id).sort((a, b) => a.localeCompare(b)),
    palette
  )

  for (const row of rows) {
    const user = userNode(row)
    if (!row.user_id && !row.username) continue
    const metrics = rowMetrics(row)
    const value = metricValue(metrics, metric)
    const current = users.get(user.id) ?? {
      label: user.label,
      value: 0,
      color: colors.get(user.id) ?? colorAt(0, palette),
    }
    current.value += value
    users.set(user.id, current)
  }

  return [...users.entries()]
    .map(([value, user]) => ({
      value,
      label: user.label,
      valueLabel: formatNumber(user.value),
      valueRaw: user.value,
      color: user.color,
    }))
    .sort((a, b) => b.valueRaw - a.valueRaw || a.label.localeCompare(b.label))
}

export function buildNodeFilterOptions(
  rows: FlowQuotaDataItem[],
  metric: FlowMetric,
  role: FlowRole,
  visibleStages: FlowNodeKind[] | undefined,
  palette: readonly string[] | undefined,
  ctx: FlowPathContext,
  selectedNodes?: readonly FlowNodeFilter[]
): FlowFilterOptions['nodes'] {
  const stages = resolveVisibleStages(role, visibleStages)
  const stageOrder = new Map(stages.map((stage, index) => [stage, index]))
  const colorIds = new Set<string>()
  for (const row of rows) {
    for (const node of flowPathForStages(row, stages, ctx)) {
      colorIds.add(node.id)
    }
  }

  const colors = stableColorMap(
    [...colorIds].sort((a, b) => a.localeCompare(b)),
    palette
  )
  const options: FlowFilterOptions['nodes'] = []

  for (const stage of stages) {
    const totals = new Map<
      string,
      {
        node: FlowPathNode
        value: number
      }
    >()
    const candidateRows = filterRowsByNodes(
      rows,
      selectedNodeFiltersExceptKind(selectedNodes, stage),
      stages,
      ctx
    )

    for (const row of candidateRows) {
      const metrics = rowMetrics(row)
      const value = metricValue(metrics, metric)
      const node = NODE_BUILDERS[stage](row, ctx)
      const key = nodeFilterKey({ kind: node.kind, id: node.id })
      const current = totals.get(key) ?? { node, value: 0 }
      current.value += value
      totals.set(key, current)
    }

    for (const rank of totals.values()) {
      options.push({
        kind: rank.node.kind,
        value: rank.node.id,
        label: rank.node.label,
        valueLabel: formatNumber(rank.value),
        valueRaw: rank.value,
        color: colors.get(rank.node.id) ?? colorAt(0, palette),
      })
    }
  }

  return options.sort(
    (a, b) =>
      (stageOrder.get(a.kind) ?? 0) - (stageOrder.get(b.kind) ?? 0) ||
      b.valueRaw - a.valueRaw ||
      a.label.localeCompare(b.label) ||
      a.value.localeCompare(b.value)
  )
}

export function buildFlowFilterOptions(
  rows: FlowQuotaDataItem[],
  metric: FlowMetric = 'quota',
  palette?: readonly string[],
  role: FlowRole = DEFAULT_FLOW_ROLE,
  visibleStages?: FlowNodeKind[],
  selectedNodes?: readonly FlowNodeFilter[]
): FlowFilterOptions {
  return {
    users: buildUserFilterOptions(rows, metric, palette),
    nodes: buildNodeFilterOptions(
      rows,
      metric,
      role,
      visibleStages,
      palette,
      EMPTY_FLOW_PATH_CONTEXT,
      selectedNodes
    ),
  }
}
