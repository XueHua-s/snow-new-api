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
  DashboardFlowGraph,
  DashboardFlowLink,
  DashboardFlowNode,
  FlowMetric,
  FlowNodeKind,
  FlowOverflowMode,
  FlowQuotaDataItem,
  FlowRole,
} from '@/features/dashboard/types'

import {
  maskFlowGraphLabels,
  applyFlowHighlights,
  buildFlowHighlightSets,
} from './flow-highlights'
import { linkStableKey } from './flow-link-identity'
import {
  type FlowPathNode,
  type FlowMetrics,
  metricValue,
  alphaColor,
  OTHER_FLOW_NODE_IDS,
  DEFAULT_OTHER_FLOW_NODE_LABELS,
  type FlowPathContext,
  type FlowNodeRank,
  rowMetrics,
  flowPathForStages,
  EMPTY_FLOW_PATH_CONTEXT,
  type FlowGraphOptions,
  resolveVisibleStages,
  DEFAULT_FLOW_OVERFLOW_MODE,
  type PreparedFlowPath,
  stableColorMap,
  colorAt,
} from './flow-paths'

function addNode(
  map: Map<string, DashboardFlowNode>,
  pathNode: FlowPathNode,
  metrics: FlowMetrics,
  metric: FlowMetric,
  color: string,
  colorKey: string
): void {
  const previous = map.get(pathNode.id) ?? {
    id: pathNode.id,
    label: pathNode.label,
    kind: pathNode.kind,
    value: 0,
    requests: 0,
    quota: 0,
    tokens: 0,
    color,
    colorKey,
  }
  previous.value += metricValue(metrics, metric)
  previous.requests += metrics.requests
  previous.quota += metrics.quota
  previous.tokens += metrics.tokens
  map.set(pathNode.id, previous)
}

function addLink(
  map: Map<string, DashboardFlowLink>,
  source: FlowPathNode,
  target: FlowPathNode,
  metrics: FlowMetrics,
  metric: FlowMetric,
  color: string,
  colorKey: string
): void {
  const key = `${source.id}\u0000${target.id}`
  const previous = map.get(key) ?? {
    source: source.id,
    target: target.id,
    value: 0,
    requests: 0,
    quota: 0,
    tokens: 0,
    sourceLabel: source.label,
    targetLabel: target.label,
    color,
    linkColor: color,
    linkAlpha: 1,
    hoverColor: color,
    colorKey,
    share: 0,
  }
  previous.value += metricValue(metrics, metric)
  previous.requests += metrics.requests
  previous.quota += metrics.quota
  previous.tokens += metrics.tokens
  map.set(key, previous)
}

function assignLinkDisplayColors(links: DashboardFlowLink[]): void {
  const linksBySource = new Map<string, DashboardFlowLink[]>()
  for (const link of links) {
    const sourceLinks = linksBySource.get(link.source) ?? []
    sourceLinks.push(link)
    linksBySource.set(link.source, sourceLinks)
  }

  for (const sourceLinks of linksBySource.values()) {
    const sortedLinks = [...sourceLinks].sort(
      (a, b) =>
        b.value - a.value || linkStableKey(a).localeCompare(linkStableKey(b))
    )
    const denominator = Math.max(sortedLinks.length - 1, 1)
    sortedLinks.forEach((link, index) => {
      const alpha =
        sortedLinks.length === 1 ? 0.34 : 0.24 + (index / denominator) * 0.2
      const displayColor = alphaColor(link.color, alpha)
      link.linkColor = displayColor.color
      link.linkAlpha = displayColor.alpha
      link.hoverColor = link.color
    })
  }
}

function byValueThenLabel<T extends { value: number; label: string }>(
  a: T,
  b: T
): number {
  return b.value - a.value || a.label.localeCompare(b.label)
}

export function byLinkDrawPriority(
  a: DashboardFlowLink,
  b: DashboardFlowLink
): number {
  return (
    Number(a.dimmed) - Number(b.dimmed) ||
    Number(b.highlighted) - Number(a.highlighted) ||
    b.value - a.value ||
    linkStableKey(a).localeCompare(linkStableKey(b))
  )
}

function normalizeTopNodeLimit(limit?: number): number | undefined {
  if (limit === undefined) return undefined
  const parsed = Math.floor(limit)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function otherFlowNode(
  kind: FlowNodeKind,
  labeler?: (kind: FlowNodeKind) => string
): FlowPathNode {
  return {
    id: OTHER_FLOW_NODE_IDS[kind],
    label: labeler?.(kind) ?? DEFAULT_OTHER_FLOW_NODE_LABELS[kind],
    kind,
  }
}

function buildTopNodeSets(
  rows: FlowQuotaDataItem[],
  metric: FlowMetric,
  stages: FlowNodeKind[],
  limit: number | undefined,
  ctx: FlowPathContext
): Map<FlowNodeKind, Set<string>> | undefined {
  if (!limit) return undefined

  const totals = new Map<FlowNodeKind, Map<string, FlowNodeRank>>()
  for (const stage of stages) {
    totals.set(stage, new Map())
  }

  for (const row of rows) {
    const metrics = rowMetrics(row)
    const value = metricValue(metrics, metric)
    const path = flowPathForStages(row, stages, ctx)
    for (const node of path) {
      const stageTotals = totals.get(node.kind)
      if (!stageTotals) continue
      const current = stageTotals.get(node.id) ?? { node, value: 0 }
      current.value += value
      stageTotals.set(node.id, current)
    }
  }

  const topSets = new Map<FlowNodeKind, Set<string>>()
  for (const [kind, stageTotals] of totals) {
    const topIds = [...stageTotals.values()]
      .sort(
        (a, b) =>
          b.value - a.value ||
          a.node.label.localeCompare(b.node.label) ||
          a.node.id.localeCompare(b.node.id)
      )
      .slice(0, limit)
      .map((rank) => rank.node.id)
    topSets.set(kind, new Set(topIds))
  }

  return topSets
}

function isTopFlowNode(
  node: FlowPathNode,
  topNodeSets?: Map<FlowNodeKind, Set<string>>
): boolean {
  const topNodes = topNodeSets?.get(node.kind)
  return !topNodes || topNodes.has(node.id)
}

function applyTopNodeLimit(
  path: FlowPathNode[],
  topNodeSets: Map<FlowNodeKind, Set<string>> | undefined,
  mode: FlowOverflowMode,
  labeler?: (kind: FlowNodeKind) => string
): FlowPathNode[] | undefined {
  if (!topNodeSets) return path
  const containsOverflowNode = path.some(
    (node) => !isTopFlowNode(node, topNodeSets)
  )
  if (!containsOverflowNode) return path
  if (mode === 'hide') return undefined
  return path.map((node) =>
    isTopFlowNode(node, topNodeSets) ? node : otherFlowNode(node.kind, labeler)
  )
}

export function buildFlowGraph(
  rows: FlowQuotaDataItem[],
  metric: FlowMetric,
  role: FlowRole,
  palette?: readonly string[],
  visibleStages?: FlowNodeKind[],
  ctx: FlowPathContext = EMPTY_FLOW_PATH_CONTEXT,
  options: FlowGraphOptions = {}
): DashboardFlowGraph {
  const stages = resolveVisibleStages(role, visibleStages)
  const topNodeSets = buildTopNodeSets(
    rows,
    metric,
    stages,
    normalizeTopNodeLimit(options.topNodeLimit),
    ctx
  )
  const overflowMode = options.overflowMode ?? DEFAULT_FLOW_OVERFLOW_MODE
  const preparedPaths: PreparedFlowPath[] = []

  for (const row of rows) {
    const path = applyTopNodeLimit(
      flowPathForStages(row, stages, ctx),
      topNodeSets,
      overflowMode,
      options.otherNodeLabel
    )
    if (!path) continue
    preparedPaths.push({ path, metrics: rowMetrics(row) })
  }

  const nodes = new Map<string, DashboardFlowNode>()
  const links = new Map<string, DashboardFlowLink>()
  const colors = stableColorMap(
    preparedPaths
      .map((prepared) => prepared.path[0]?.id)
      .filter((id): id is string => Boolean(id))
      .sort((a, b) => a.localeCompare(b)),
    palette
  )

  for (const prepared of preparedPaths) {
    const { path, metrics } = prepared
    const root = path[0]
    if (!root) continue
    const color = colors.get(root.id) ?? colorAt(0, palette)

    for (const node of path) {
      addNode(nodes, node, metrics, metric, color, root.id)
    }
    for (let i = 0; i < path.length - 1; i++) {
      const source = path[i]
      const target = path[i + 1]
      if (!source || !target) continue
      addLink(links, source, target, metrics, metric, color, root.id)
    }
  }
  if (options.maskSensitive) {
    maskFlowGraphLabels(nodes, links)
  }
  applyFlowHighlights(
    nodes.values(),
    links.values(),
    buildFlowHighlightSets(
      preparedPaths,
      options.activeNode,
      options.activeLink,
      stages
    )
  )

  const flowLinks = [...links.values()].sort(
    (a, b) =>
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
  )
  const firstStepSources = new Set(
    preparedPaths
      .map((prepared) => prepared.path[0]?.id)
      .filter((id): id is string => Boolean(id))
  )
  const total = flowLinks
    .filter((link) => firstStepSources.has(link.source))
    .reduce((sum, link) => sum + link.value, 0)
  for (const link of flowLinks) {
    link.share = total > 0 ? link.value / total : 0
  }
  assignLinkDisplayColors(flowLinks)

  return {
    nodes: [...nodes.values()].sort(byValueThenLabel),
    links: flowLinks,
  }
}

export { pathLinkKey, linkStableKey } from './flow-link-identity'
