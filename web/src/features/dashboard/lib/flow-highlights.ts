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
  DashboardFlowLink,
  DashboardFlowNode,
  FlowLinkSelection,
  FlowNodeFilter,
  FlowNodeKind,
} from '@/features/dashboard/types'

import { pathLinkKey, linkStableKey } from './flow-link-identity'
import {
  type FlowPathNode,
  type PreparedFlowPath,
  type FlowHighlightSets,
  SENSITIVE_FLOW_KINDS,
  OTHER_FLOW_NODE_ID_SET,
} from './flow-paths'

function pathContainsFlowNode(
  path: FlowPathNode[],
  filter: FlowNodeFilter
): boolean {
  return path.some((node) => node.kind === filter.kind && node.id === filter.id)
}

function pathContainsFlowLink(
  path: FlowPathNode[],
  link: FlowLinkSelection
): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    if (path[i]?.id === link.source && path[i + 1]?.id === link.target) {
      return true
    }
  }
  return false
}

export function buildFlowHighlightSets(
  preparedPaths: PreparedFlowPath[],
  activeNode: FlowNodeFilter | undefined,
  activeLink: FlowLinkSelection | undefined,
  stages: FlowNodeKind[]
): FlowHighlightSets | undefined {
  const nodeActive = Boolean(activeNode && stages.includes(activeNode.kind))
  if (!nodeActive && !activeLink) return undefined

  // A link selection highlights paths that traverse that exact edge; otherwise
  // fall back to highlighting paths that pass through the active node.
  const matchesPath = (path: FlowPathNode[]): boolean => {
    if (activeLink) return pathContainsFlowLink(path, activeLink)
    return activeNode ? pathContainsFlowNode(path, activeNode) : false
  }

  const highlightedNodes = new Set<string>()
  const highlightedLinks = new Set<string>()
  for (const prepared of preparedPaths) {
    const { path } = prepared
    if (!matchesPath(path)) continue

    for (const node of path) {
      highlightedNodes.add(node.id)
    }
    for (let i = 0; i < path.length - 1; i++) {
      const source = path[i]
      const target = path[i + 1]
      if (!source || !target) continue
      highlightedLinks.add(pathLinkKey(source, target))
    }
  }

  if (highlightedNodes.size === 0) return undefined
  return {
    nodes: highlightedNodes,
    links: highlightedLinks,
  }
}

// Fully masks a label. Nodes stay distinct because the Sankey identifies them
// by `key` (the node id), not by this display text, so identical masked labels
// never merge.
const FLOW_MASK_TEXT = '\u2022\u2022\u2022\u2022'

function maskFlowLabel(label: string): string {
  if (label.length === 0) return label
  return FLOW_MASK_TEXT
}

// Masks sensitive node/link labels in place. Node identity (`id`) is untouched,
// so links, highlighting, and layout stay exactly the same; only the rendered
// text changes.
export function maskFlowGraphLabels(
  nodes: Map<string, DashboardFlowNode>,
  links: Map<string, DashboardFlowLink>
): void {
  const maskedById = new Map<string, string>()
  for (const node of nodes.values()) {
    if (!SENSITIVE_FLOW_KINDS.has(node.kind)) continue
    if (OTHER_FLOW_NODE_ID_SET.has(node.id)) continue
    const masked = maskFlowLabel(node.label)
    node.label = masked
    maskedById.set(node.id, masked)
  }
  if (maskedById.size === 0) return
  for (const link of links.values()) {
    const sourceMasked = maskedById.get(link.source)
    if (sourceMasked !== undefined) link.sourceLabel = sourceMasked
    const targetMasked = maskedById.get(link.target)
    if (targetMasked !== undefined) link.targetLabel = targetMasked
  }
}

export function applyFlowHighlights(
  nodes: Iterable<DashboardFlowNode>,
  links: Iterable<DashboardFlowLink>,
  highlightSets: FlowHighlightSets | undefined
): void {
  if (!highlightSets) return

  for (const node of nodes) {
    node.highlighted = highlightSets.nodes.has(node.id)
    node.dimmed = !node.highlighted
  }
  for (const link of links) {
    const highlighted = highlightSets.links.has(linkStableKey(link))
    link.highlighted = highlighted
    link.dimmed = !highlighted
  }
}
