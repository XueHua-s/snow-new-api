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
  FlowLinkSelection,
  FlowMetric,
  FlowNodeFilter,
  FlowNodeKind,
  FlowOverflowMode,
  FlowQuotaDataItem,
  FlowRole,
} from '@/features/dashboard/types'

import { getDashboardChartColors } from './chart-format'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VChartSpec = Record<string, any>

export type FlowMetrics = {
  quota: number
  tokens: number
  requests: number
}

export type FlowSankeyLabels = {
  quota: string
  tokens: string
  requests: string
  share: string
}

export type FlowPathNode = {
  id: string
  label: string
  kind: FlowNodeKind
}

export type PreparedFlowPath = {
  path: FlowPathNode[]
  metrics: FlowMetrics
}

export type FlowNodeRank = {
  node: FlowPathNode
  value: number
}

export type FlowPathContext = {
  deletedTokenLabel?: (tokenId: number) => string
}

export type FlowGraphOptions = {
  topNodeLimit?: number
  overflowMode?: FlowOverflowMode
  otherNodeLabel?: (kind: FlowNodeKind) => string
  activeNode?: FlowNodeFilter
  activeLink?: FlowLinkSelection
  maskSensitive?: boolean
}

export type FlowHighlightSets = {
  nodes: Set<string>
  links: Set<string>
}

export const EMPTY_FLOW_PATH_CONTEXT: FlowPathContext = {}

export const DEFAULT_FLOW_ROLE: FlowRole = 'user'

export const DEFAULT_FLOW_OVERFLOW_MODE: FlowOverflowMode = 'aggregate'

export const DEFAULT_FLOW_SANKEY_LABELS: FlowSankeyLabels = {
  quota: 'Quota',
  tokens: 'Tokens',
  requests: 'Requests',
  share: 'Share',
}

const DEFAULT_FLOW_CHART_COLOR = '#1664FF'

const FLOW_NODE_KINDS: readonly FlowNodeKind[] = [
  'user',
  'node',
  'token',
  'group',
  'model',
  'channel',
]

const FLOW_NODE_KIND_SET = new Set<FlowNodeKind>(FLOW_NODE_KINDS)

export const OTHER_FLOW_NODE_IDS: Record<FlowNodeKind, string> = {
  user: 'user:__other__',
  node: 'node:__other__',
  token: 'token:__other__',
  group: 'group:__other__',
  model: 'model:__other__',
  channel: 'channel:__other__',
}

export const DEFAULT_OTHER_FLOW_NODE_LABELS: Record<FlowNodeKind, string> = {
  user: 'Other users',
  node: 'Other nodes',
  token: 'Other tokens',
  group: 'Other groups',
  model: 'Other models',
  channel: 'Other channels',
}

// Kinds whose labels can leak identity (people, keys, infra, business setup).
// Model names are public, so they stay visible even when masking is on.
export const SENSITIVE_FLOW_KINDS = new Set<FlowNodeKind>([
  'user',
  'node',
  'token',
  'group',
  'channel',
])

export const OTHER_FLOW_NODE_ID_SET = new Set<string>(
  Object.values(OTHER_FLOW_NODE_IDS)
)

export function numberValue(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function isFlowNodeKind(value: unknown): value is FlowNodeKind {
  return (
    typeof value === 'string' && FLOW_NODE_KIND_SET.has(value as FlowNodeKind)
  )
}

export function rowMetrics(row: FlowQuotaDataItem): FlowMetrics {
  return {
    quota: numberValue(row.quota),
    tokens: numberValue(row.token_used),
    requests: numberValue(row.count),
  }
}

export function metricValue(metrics: FlowMetrics, metric: FlowMetric): number {
  if (metric === 'requests') return metrics.requests
  if (metric === 'tokens') return metrics.tokens
  return metrics.quota
}

export function userNode(row: FlowQuotaDataItem): FlowPathNode {
  const userID = numberValue(row.user_id)
  return {
    id: userID > 0 ? `user:${userID}` : `user:${row.username || 'unknown'}`,
    label: row.username || (userID > 0 ? `user-${userID}` : 'Unknown User'),
    kind: 'user',
  }
}

function nodeNameNode(row: FlowQuotaDataItem): FlowPathNode {
  const nodeName = row.node_name || 'default-node'
  return {
    id: `node:${nodeName}`,
    label: nodeName,
    kind: 'node',
  }
}

function tokenNode(row: FlowQuotaDataItem, ctx: FlowPathContext): FlowPathNode {
  const tokenID = numberValue(row.token_id)
  return {
    id:
      tokenID > 0 ? `token:${tokenID}` : `token:${row.token_name || 'unknown'}`,
    label: row.token_name || deletedTokenLabel(tokenID, ctx),
    kind: 'token',
  }
}

export function deletedTokenLabel(
  tokenID: number,
  ctx: FlowPathContext
): string {
  if (tokenID <= 0) return 'Unknown Token'
  return ctx.deletedTokenLabel?.(tokenID) ?? `token-${tokenID}`
}

function groupNode(row: FlowQuotaDataItem): FlowPathNode {
  const useGroup = row.use_group || 'unknown'
  return {
    id: `group:${useGroup}`,
    label: useGroup,
    kind: 'group',
  }
}

function modelNode(row: FlowQuotaDataItem): FlowPathNode {
  const model = row.model_name || 'unknown'
  return {
    id: `model:${model}`,
    label: row.model_name || 'Unknown Model',
    kind: 'model',
  }
}

function channelNode(row: FlowQuotaDataItem): FlowPathNode {
  const channelID = numberValue(row.channel_id)
  return {
    id:
      channelID > 0
        ? `channel:${channelID}`
        : `channel:${row.channel_name || 'unknown'}`,
    label:
      row.channel_name || (channelID > 0 ? `channel-${channelID}` : 'Unknown'),
    kind: 'channel',
  }
}

export const NODE_BUILDERS: Record<
  FlowNodeKind,
  (row: FlowQuotaDataItem, ctx: FlowPathContext) => FlowPathNode
> = {
  user: userNode,
  node: nodeNameNode,
  token: tokenNode,
  group: groupNode,
  model: modelNode,
  channel: channelNode,
}

const ROLE_FLOW_STAGES: Record<FlowRole, FlowNodeKind[]> = {
  root: ['user', 'node', 'token', 'group', 'model', 'channel'],
  admin: ['user', 'group', 'model', 'channel'],
  user: ['token', 'group', 'model'],
}

// A Sankey needs at least two columns to draw any link, so hiding stages can
// never collapse the path below this many columns.
const MIN_FLOW_STAGES = 2

export function getFlowStages(role: FlowRole): FlowNodeKind[] {
  return ROLE_FLOW_STAGES[role] ?? ROLE_FLOW_STAGES.user
}

export function resolveVisibleStages(
  role: FlowRole,
  visibleStages?: FlowNodeKind[]
): FlowNodeKind[] {
  const stages = getFlowStages(role)
  if (!visibleStages) return stages
  const visible = new Set(visibleStages)
  const filtered = stages.filter((stage) => visible.has(stage))
  return filtered.length >= MIN_FLOW_STAGES ? filtered : stages
}

export function flowPathForStages(
  row: FlowQuotaDataItem,
  stages: FlowNodeKind[],
  ctx: FlowPathContext = EMPTY_FLOW_PATH_CONTEXT
): FlowPathNode[] {
  return stages.map((stage) => NODE_BUILDERS[stage](row, ctx))
}

export function colorAt(index: number, palette?: readonly string[]): string {
  const colors =
    palette && palette.length > 0 ? palette : getDashboardChartColors(index + 1)
  if (colors.length === 0) return DEFAULT_FLOW_CHART_COLOR
  return colors[index % colors.length] ?? DEFAULT_FLOW_CHART_COLOR
}

export function colorPalette(
  colorCount: number,
  palette?: readonly string[]
): readonly string[] {
  if (palette && palette.length > 0) return palette
  const colors = getDashboardChartColors(colorCount)
  return colors.length > 0 ? colors : [DEFAULT_FLOW_CHART_COLOR]
}

export function alphaColor(
  color: string,
  alpha: number
): { color: string; alpha: number } {
  const normalized = color.trim()
  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return { color: normalized, alpha }
  }

  const value = Number.parseInt(hex, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return {
    color: `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(2)})`,
    alpha: 1,
  }
}

export function stableColorMap(
  keys: string[],
  palette?: readonly string[]
): Map<string, string> {
  const map = new Map<string, string>()
  const uniqueKeys = [...new Set(keys)]
  const colors = colorPalette(uniqueKeys.length, palette)
  uniqueKeys.forEach((key, index) => {
    map.set(key, colorAt(index, colors))
  })
  return map
}
