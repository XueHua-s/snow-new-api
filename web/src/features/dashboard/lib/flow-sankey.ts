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
  FlowNodeFilter,
} from '@/features/dashboard/types'

import { formatNumber } from './flow-filters'
import { byLinkDrawPriority } from './flow-graph'
import { linkStableKey } from './flow-link-identity'
import {
  numberValue,
  isFlowNodeKind,
  type FlowSankeyLabels,
  DEFAULT_FLOW_SANKEY_LABELS,
  type VChartSpec,
  colorAt,
} from './flow-paths'

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function sankeyDatumSource(
  datum: Record<string, unknown>
): Record<string, unknown> {
  const nested = datum.datum
  if (Array.isArray(nested)) {
    const depth = numberValue(datum.depth)
    return recordValue(nested[depth]) ?? recordValue(nested[0]) ?? datum
  }
  return recordValue(nested) ?? datum
}

function sankeyDatumValue(
  datum: Record<string, unknown>,
  key: string
): unknown {
  if (datum[key] !== undefined) return datum[key]
  return sankeyDatumSource(datum)[key]
}

function sankeyDatumFlag(datum: Record<string, unknown>, key: string): boolean {
  return sankeyDatumValue(datum, key) === true
}

export function flowSankeyDatumValue(datum: unknown, key: string): unknown {
  const record = recordValue(datum)
  return record ? sankeyDatumValue(record, key) : undefined
}

function isSankeyLinkDatum(datum: Record<string, unknown>): boolean {
  return (
    sankeyDatumValue(datum, 'source') !== undefined &&
    sankeyDatumValue(datum, 'target') !== undefined
  )
}

export function flowNodeFilterFromSankeyDatum(
  datum: unknown
): FlowNodeFilter | undefined {
  const record = recordValue(datum)
  if (!record || isSankeyLinkDatum(record)) return undefined

  const id = flowSankeyDatumValue(record, 'key')
  const kind = flowSankeyDatumValue(record, 'kind')
  if (
    (typeof id === 'string' || typeof id === 'number') &&
    isFlowNodeKind(kind)
  ) {
    return { kind, id: String(id) }
  }
  return undefined
}

function tooltipMetricLines(
  valueFormatter: (value: number) => string,
  labels: FlowSankeyLabels
) {
  const metricValue = (datum: Record<string, unknown>, key: string) =>
    numberValue(sankeyDatumValue(datum, key))
  const formattedNumber = (datum: Record<string, unknown>, key: string) =>
    formatNumber(metricValue(datum, key))
  const hasMetric = (datum: Record<string, unknown>, key: string) =>
    metricValue(datum, key) > 0

  return [
    {
      key: labels.quota,
      value: (datum: Record<string, unknown>) =>
        valueFormatter(metricValue(datum, 'quota')),
    },
    {
      key: labels.tokens,
      value: (datum: Record<string, unknown>) =>
        formattedNumber(datum, 'tokens'),
    },
    {
      key: labels.requests,
      value: (datum: Record<string, unknown>) =>
        formattedNumber(datum, 'requests'),
    },
    {
      key: labels.share,
      value: (datum: Record<string, unknown>) =>
        `${(metricValue(datum, 'share') * 100).toFixed(1)}%`,
      visible: (datum: Record<string, unknown>) => hasMetric(datum, 'share'),
    },
  ]
}

export function buildFlowSankeySpec(
  flow: DashboardFlowGraph,
  title: string,
  valueFormatter: (value: number) => string = formatNumber,
  labels: FlowSankeyLabels = DEFAULT_FLOW_SANKEY_LABELS
): VChartSpec {
  return {
    type: 'sankey',
    data: [
      {
        id: 'flow',
        values: [
          {
            nodes: flow.nodes.map((node) => ({
              key: node.id,
              name: node.label,
              rawLabel: node.label,
              kind: node.kind,
              value: node.value,
              requests: node.requests,
              quota: node.quota,
              tokens: node.tokens,
              color: node.color,
              colorKey: node.colorKey,
              highlighted: node.highlighted,
              dimmed: node.dimmed,
            })),
            links: flow.links
              .filter((link) => link.value > 0)
              .sort(byLinkDrawPriority)
              .map((link, index) => {
                let zIndex = 100_000 + index
                if (link.highlighted) {
                  zIndex = 1_000_000 + index
                } else if (link.dimmed) {
                  zIndex = index
                }

                return {
                  source: link.source,
                  target: link.target,
                  linkKey: linkStableKey(link),
                  sourceLabel: link.sourceLabel,
                  targetLabel: link.targetLabel,
                  value: link.value,
                  requests: link.requests,
                  quota: link.quota,
                  tokens: link.tokens,
                  color: link.color,
                  linkColor: link.linkColor,
                  linkAlpha: link.linkAlpha,
                  hoverColor: link.hoverColor,
                  colorKey: link.colorKey,
                  share: link.share,
                  highlighted: link.highlighted,
                  dimmed: link.dimmed,
                  zIndex,
                }
              }),
          },
        ],
      },
    ],
    categoryField: 'name',
    sourceField: 'source',
    targetField: 'target',
    valueField: 'value',
    nodeKey: 'key',
    direction: 'horizontal',
    nodeAlign: 'justify',
    crossNodeAlign: 'middle',
    linkSortBy: (
      a: { value?: number; source?: string; target?: string; index?: number },
      b: { value?: number; source?: string; target?: string; index?: number }
    ) =>
      numberValue(b.value) - numberValue(a.value) ||
      `${a.source ?? ''}\u0000${a.target ?? ''}`.localeCompare(
        `${b.source ?? ''}\u0000${b.target ?? ''}`
      ) ||
      numberValue(a.index) - numberValue(b.index),
    nodeGap: 14,
    nodeWidth: 16,
    minLinkHeight: 2,
    minNodeHeight: 8,
    title: {
      visible: false,
      text: title,
    },
    legends: { visible: false },
    label: {
      visible: true,
      position: 'outside',
      limit: 220,
      interactive: false,
      style: {
        fill: '#475569',
        fontSize: 11,
        fontWeight: 600,
      },
    },
    node: {
      interactive: true,
      style: {
        fill: (datum: Record<string, unknown>) =>
          String(sankeyDatumValue(datum, 'color') ?? colorAt(0)),
        fillOpacity: (datum: Record<string, unknown>) => {
          if (sankeyDatumFlag(datum, 'dimmed')) return 0.18
          if (sankeyDatumFlag(datum, 'highlighted')) return 1
          return 0.92
        },
        stroke: (datum: Record<string, unknown>) =>
          sankeyDatumFlag(datum, 'highlighted')
            ? 'rgba(15, 23, 42, 0.74)'
            : 'rgba(148, 163, 184, 0.45)',
        lineWidth: (datum: Record<string, unknown>) =>
          sankeyDatumFlag(datum, 'highlighted') ? 1.5 : 1,
        cursor: 'pointer',
        pickMode: 'accurate',
      },
      state: {
        hover: {
          fillOpacity: 1,
          stroke: 'rgba(15, 23, 42, 0.68)',
          lineWidth: 1.5,
        },
        selected: {
          fillOpacity: 1,
          stroke: 'rgba(15, 23, 42, 0.68)',
          lineWidth: 1.5,
        },
        blur: {
          fillOpacity: 0.22,
        },
      },
    },
    link: {
      interactive: true,
      style: {
        fill: (datum: Record<string, unknown>) =>
          String(
            sankeyDatumValue(datum, 'linkColor') ??
              sankeyDatumValue(datum, 'color') ??
              colorAt(0)
          ),
        fillOpacity: (datum: Record<string, unknown>) => {
          if (sankeyDatumFlag(datum, 'dimmed')) return 0.08
          if (sankeyDatumFlag(datum, 'highlighted')) return 0.86
          return numberValue(sankeyDatumValue(datum, 'linkAlpha')) || 1
        },
        cursor: 'pointer',
        pickMode: 'accurate',
        boundsMode: 'accurate',
        zIndex: (datum: Record<string, unknown>) => {
          const zIndex = sankeyDatumValue(datum, 'zIndex')
          if (zIndex !== undefined) return numberValue(zIndex)
          return 1_000_000_000 - numberValue(sankeyDatumValue(datum, 'value'))
        },
      },
      state: {
        hover: {
          fill: (datum: Record<string, unknown>) =>
            String(
              sankeyDatumValue(datum, 'hoverColor') ??
                sankeyDatumValue(datum, 'color') ??
                colorAt(0)
            ),
          fillOpacity: 0.9,
        },
        selected: {
          fill: (datum: Record<string, unknown>) =>
            String(
              sankeyDatumValue(datum, 'hoverColor') ??
                sankeyDatumValue(datum, 'color') ??
                colorAt(0)
            ),
          fillOpacity: 0.9,
        },
        blur: {
          fillOpacity: 0.22,
        },
      },
    },
    // Highlighting is driven entirely by our own `highlighted`/`dimmed` data
    // flags (see fillOpacity above). VChart's built-in click emphasis is
    // disabled because its Sankey "related" handler crashes on click
    // (_handleLinkRelatedClick) and would otherwise fight our full-path
    // highlight.
    emphasis: { enable: false },
    tooltip: {
      trigger: 'hover',
      activeType: 'mark',
      dimension: { visible: false },
      group: { visible: false },
      mark: {
        checkOverlap: true,
        positionMode: 'pointer',
        visible: (datum: Record<string, unknown>) =>
          isSankeyLinkDatum(datum) ||
          sankeyDatumValue(datum, 'key') !== undefined,
        title: {
          value: (datum: Record<string, unknown>) => {
            const source = sankeyDatumValue(datum, 'source')
            const target = sankeyDatumValue(datum, 'target')
            if (source && target) {
              const sourceLabel = sankeyDatumValue(datum, 'sourceLabel')
              const targetLabel = sankeyDatumValue(datum, 'targetLabel')
              return `${sourceLabel ?? source} -> ${targetLabel ?? target}`
            }
            return `${sankeyDatumValue(datum, 'name') ?? sankeyDatumValue(datum, 'rawLabel') ?? ''}`
          },
        },
        content: tooltipMetricLines(valueFormatter, labels),
      },
    },
    background: { fill: 'transparent' },
    animation: false,
  }
}
