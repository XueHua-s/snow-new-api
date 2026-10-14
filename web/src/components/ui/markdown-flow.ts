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
import 'katex/dist/katex.min.css'
import { escapeHtml } from './markdown-escape'

type FlowNode = {
  id: string
  label: string
  type: string
}

type FlowEdge = {
  from: string
  label?: string
  to: string
}

type FlowNodeLayout = {
  height: number
  labelLines: string[]
  node: FlowNode
  width: number
  x: number
  y: number
}

function getTextUnits(value: string): number {
  return [...value].reduce((total, character) => {
    if (/\s/.test(character)) {
      return total + 0.5
    }

    if (/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(character)) {
      return total + 2
    }

    return total + 1
  }, 0)
}

function splitFlowLabel(label: string, maxUnits: number): string[] {
  const words = label.trim().split(/(\s+)/).filter(Boolean)
  const lines: string[] = []
  let currentLine = ''

  words.forEach((word) => {
    const candidate = `${currentLine}${word}`

    if (currentLine && getTextUnits(candidate) > maxUnits) {
      lines.push(currentLine.trim())
      currentLine = word.trimStart()
      return
    }

    currentLine = candidate
  })

  if (currentLine.trim()) {
    lines.push(currentLine.trim())
  }

  return lines.length > 0 ? lines : [label]
}

function renderFlowText(layout: FlowNodeLayout): string {
  const lineHeight = 18
  const firstLineY =
    layout.y - ((layout.labelLines.length - 1) * lineHeight) / 2 + 5

  return layout.labelLines
    .map((line, index) => {
      return `<text x="${layout.x}" y="${firstLineY + index * lineHeight}" text-anchor="middle" class="markdown-diagram-text">${escapeHtml(line)}</text>`
    })
    .join('')
}

function getFlowNodeLayout(
  node: FlowNode,
  index: number,
  centerX: number
): FlowNodeLayout {
  const isCondition = node.type === 'condition'
  const labelLines = splitFlowLabel(node.label, isCondition ? 14 : 18)
  const labelWidth = Math.max(
    ...labelLines.map((line) => getTextUnits(line) * 7.2)
  )
  const textHeight = labelLines.length * 18

  if (isCondition) {
    return {
      height: Math.max(112, textHeight + 76),
      labelLines,
      node,
      width: Math.max(190, labelWidth + 92),
      x: centerX,
      y: 64 + index * 132,
    }
  }

  if (node.type === 'start' || node.type === 'end') {
    return {
      height: 38,
      labelLines,
      node,
      width: Math.max(124, labelWidth + 44),
      x: centerX,
      y: 64 + index * 132,
    }
  }

  return {
    height: Math.max(54, textHeight + 28),
    labelLines,
    node,
    width: Math.max(166, labelWidth + 52),
    x: centerX,
    y: 64 + index * 132,
  }
}

function getFlowAnchor(
  layout: FlowNodeLayout,
  side: 'bottom' | 'left' | 'right' | 'top'
): {
  x: number
  y: number
} {
  if (side === 'top') {
    return { x: layout.x, y: layout.y - layout.height / 2 }
  }

  if (side === 'bottom') {
    return { x: layout.x, y: layout.y + layout.height / 2 }
  }

  if (side === 'left') {
    return { x: layout.x - layout.width / 2, y: layout.y }
  }

  return { x: layout.x + layout.width / 2, y: layout.y }
}

function renderFlowShape(layout: FlowNodeLayout): string {
  const halfWidth = layout.width / 2
  const halfHeight = layout.height / 2
  const label = renderFlowText(layout)

  if (layout.node.type === 'condition') {
    return `
      <polygon points="${layout.x},${layout.y - halfHeight} ${layout.x + halfWidth},${layout.y} ${layout.x},${layout.y + halfHeight} ${layout.x - halfWidth},${layout.y}" class="markdown-diagram-node markdown-flow-condition" />
      ${label}
    `
  }

  if (layout.node.type === 'start' || layout.node.type === 'end') {
    return `
      <rect x="${layout.x - halfWidth}" y="${layout.y - halfHeight}" width="${layout.width}" height="${layout.height}" rx="${halfHeight}" ry="${halfHeight}" class="markdown-diagram-node markdown-flow-terminal" />
      ${label}
    `
  }

  return `
    <rect x="${layout.x - halfWidth}" y="${layout.y - halfHeight}" width="${layout.width}" height="${layout.height}" rx="6" ry="6" class="markdown-diagram-node markdown-flow-operation" />
    ${label}
  `
}

function parseFlowDiagram(source: string): {
  edges: FlowEdge[]
  nodes: FlowNode[]
} {
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []

  lines.forEach((line) => {
    const nodeMatch = /^([A-Za-z][\w-]*)=>([A-Za-z]+):\s*(.+)$/.exec(line)

    if (nodeMatch) {
      const [, id, type, label] = nodeMatch
      nodes.push({ id, label, type: type.toLowerCase() })
      return
    }

    const edgeParts = line.split('->')

    if (edgeParts.length < 2) {
      return
    }

    for (let index = 0; index < edgeParts.length - 1; index += 1) {
      const fromMatch = /^([A-Za-z][\w-]*)(?:\(([^)]+)\))?$/.exec(
        edgeParts[index]
      )
      const toMatch = /^([A-Za-z][\w-]*)(?:\(([^)]+)\))?$/.exec(
        edgeParts[index + 1]
      )

      if (!fromMatch || !toMatch) {
        continue
      }

      const from = fromMatch[1]
      const to = toMatch[1]
      const edgeLabel = fromMatch[2]
      edges.push({ from, label: edgeLabel, to })
    }
  })

  return { edges, nodes }
}

export function renderFlowDiagram(source: string): string {
  const { edges, nodes } = parseFlowDiagram(source)
  const width = 660
  const centerX = 300
  const loopX = 520
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]))
  const nodePositions = new Map(
    nodes.map((node, index) => [
      node.id,
      getFlowNodeLayout(node, index, centerX),
    ])
  )
  const lastNode =
    nodes.length > 0 ? nodePositions.get(nodes.at(-1)?.id ?? '') : undefined
  const height = Math.max(
    180,
    (lastNode?.y ?? 64) + (lastNode?.height ?? 40) / 2 + 54
  )
  const renderedEdges = edges
    .map((edge) => {
      const from = nodePositions.get(edge.from)
      const to = nodePositions.get(edge.to)

      if (!from || !to) {
        return ''
      }

      const isBackward =
        (nodeIndex.get(edge.to) ?? 0) <= (nodeIndex.get(edge.from) ?? 0)

      if (isBackward) {
        const fromAnchor = getFlowAnchor(from, 'right')
        const toAnchor = getFlowAnchor(to, 'right')
        const d = `M ${fromAnchor.x} ${fromAnchor.y} C ${loopX} ${fromAnchor.y}, ${loopX} ${toAnchor.y}, ${toAnchor.x} ${toAnchor.y}`
        const label = edge.label
          ? `<text x="${loopX - 38}" y="${(fromAnchor.y + toAnchor.y) / 2 - 8}" class="markdown-diagram-edge-label">${escapeHtml(edge.label)}</text>`
          : ''

        return `<path d="${d}" class="markdown-diagram-edge" marker-end="url(#markdown-diagram-arrow)" />${label}`
      }

      const fromAnchor = getFlowAnchor(from, 'bottom')
      const toAnchor = getFlowAnchor(to, 'top')
      const label = edge.label
        ? `<text x="${fromAnchor.x + 38}" y="${(fromAnchor.y + toAnchor.y) / 2 - 8}" class="markdown-diagram-edge-label">${escapeHtml(edge.label)}</text>`
        : ''

      return `
        <line x1="${fromAnchor.x}" y1="${fromAnchor.y}" x2="${toAnchor.x}" y2="${toAnchor.y}" class="markdown-diagram-edge" marker-end="url(#markdown-diagram-arrow)" />
        ${label}
      `
    })
    .join('')
  const renderedNodes = nodes
    .map((node) => {
      const position = nodePositions.get(node.id)

      if (!position) {
        return ''
      }

      return renderFlowShape(position)
    })
    .join('')

  return `
    <div class="not-prose markdown-diagram">
      <svg data-diagram="flow" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMin meet">
        <defs>
          <marker id="markdown-diagram-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 8 4 L 0 8 z" class="markdown-diagram-arrow" />
          </marker>
        </defs>
        ${renderedEdges}
        ${renderedNodes}
      </svg>
    </div>
  `
}
