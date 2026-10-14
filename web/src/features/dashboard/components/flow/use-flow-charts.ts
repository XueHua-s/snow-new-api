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
import { useQuery } from '@tanstack/react-query'
import type { EventParamsDefinition, IVChart } from '@visactor/vchart'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getFlowQuotaDates } from '@/features/dashboard/api'
import {
  flowDisplayState,
  requireSuccessfulFlowRows,
} from '@/features/dashboard/lib/flow-selection'
import type {
  DashboardFilters,
  FlowLinkSelection,
  FlowMetric,
  FlowNodeFilter,
  FlowNodeKind,
  FlowOverflowMode,
  FlowRole,
} from '@/features/dashboard/types'
import { formatQuota } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { computeTimeRange } from '@/lib/time'
import { useChartTheme } from '@/lib/use-chart-theme'
import { useAuthStore } from '@/stores/auth-store'

import { buildQueryParams, getDefaultDays } from '../../lib/filters'
import { buildDashboardFlowData } from '../../lib/flow'
import { getFlowStages } from '../../lib/flow-paths'
import {
  buildFlowSankeySpec,
  flowNodeFilterFromSankeyDatum,
  flowSankeyDatumValue,
} from '../../lib/flow-sankey'
import {
  DEFAULT_FLOW_TOP_NODE_LIMIT,
  MIN_VISIBLE_STAGES,
  FLOW_OTHER_NODE_LABEL_KEYS,
  FLOW_METRIC_LABEL_KEYS,
  formatFlowMetricNumber,
} from './flow-chart-options'

export interface FlowChartsProps {
  filters?: DashboardFilters
  // When false, sensitive node labels are masked in the rendered Sankey.
  sensitiveVisible?: boolean
}

type FlowChartPointerEvent = EventParamsDefinition['pointerdown']

function chartRecordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function looksLikeFlowDatum(value: unknown): boolean {
  const record = chartRecordValue(value)
  if (!record) return false
  return (
    (record.key !== undefined && record.kind !== undefined) ||
    (record.source !== undefined && record.target !== undefined)
  )
}

function chartGraphicDatum(value: unknown): unknown {
  const record = chartRecordValue(value)
  const context = chartRecordValue(record?.context)
  const data = context?.data
  if (Array.isArray(data)) return data[0]
  return data
}

function flowChartEventDatum(event: FlowChartPointerEvent): unknown {
  const record = chartRecordValue(event)
  if (!record) return undefined

  if (record.datum !== undefined && record.datum !== null) return record.datum

  const itemRecord = chartRecordValue(record.item)
  if (itemRecord?.datum !== undefined && itemRecord.datum !== null) {
    return itemRecord.datum
  }

  const graphicDatum = chartGraphicDatum(record.item)
  if (graphicDatum !== undefined && graphicDatum !== null) return graphicDatum

  const itemData = itemRecord?.data
  if (Array.isArray(itemData)) return itemData[0]
  if (itemData !== undefined && itemData !== null) return itemData

  return looksLikeFlowDatum(record) ? record : undefined
}

function flowNodeFilterKey(filter: FlowNodeFilter): string {
  return `${filter.kind}\u0000${filter.id}`
}

function isSameFlowNodeFilter(
  a: FlowNodeFilter | undefined,
  b: FlowNodeFilter
): boolean {
  return Boolean(a && a.kind === b.kind && a.id === b.id)
}

function toggleSelectedValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

function toggleSelectedNodeFilter(
  filters: FlowNodeFilter[],
  filter: FlowNodeFilter
): FlowNodeFilter[] {
  const key = flowNodeFilterKey(filter)
  const hasFilter = filters.some((item) => flowNodeFilterKey(item) === key)
  return hasFilter
    ? filters.filter((item) => flowNodeFilterKey(item) !== key)
    : [...filters, filter]
}

export function useFlowCharts(props: FlowChartsProps) {
  const { t } = useTranslation()
  const { resolvedTheme, themeReady } = useChartTheme()
  const chartInstanceRef = useRef<IVChart | null>(null)
  const user = useAuthStore((state) => state.auth.user)
  const isRoot = Boolean(user?.role && user.role >= ROLE.SUPER_ADMIN)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)
  let flowRole: FlowRole = 'user'
  if (isRoot) {
    flowRole = 'root'
  } else if (isAdmin) {
    flowRole = 'admin'
  }
  const [metric, setMetric] = useState<FlowMetric>('quota')
  const [topNodeLimit, setTopNodeLimit] = useState(DEFAULT_FLOW_TOP_NODE_LIMIT)
  const [overflowMode, setOverflowMode] =
    useState<FlowOverflowMode>('aggregate')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [selectedNodes, setSelectedNodes] = useState<FlowNodeFilter[]>([])
  const [activeFlowNode, setActiveFlowNode] = useState<
    FlowNodeFilter | undefined
  >()
  const [activeFlowLink, setActiveFlowLink] = useState<
    FlowLinkSelection | undefined
  >()
  const [hiddenStages, setHiddenStages] = useState<FlowNodeKind[]>([])

  const stages = useMemo(() => getFlowStages(flowRole), [flowRole])
  const visibleStages = useMemo(
    () => stages.filter((stage) => !hiddenStages.includes(stage)),
    [stages, hiddenStages]
  )
  useEffect(() => {
    const visible = new Set(visibleStages)
    setSelectedNodes((prev) => {
      const next = prev.filter((filter) => visible.has(filter.kind))
      return next.length === prev.length ? prev : next
    })
    setActiveFlowNode((prev) =>
      prev && visible.has(prev.kind) ? prev : undefined
    )
    // The graph reshapes when columns are toggled, so any highlighted edge may
    // no longer exist. Drop the link selection rather than leave it dangling.
    setActiveFlowLink(undefined)
  }, [visibleStages])
  const toggleStage = (stage: FlowNodeKind) => {
    setHiddenStages((prev) => {
      const hidden = new Set(prev)
      if (hidden.has(stage)) {
        hidden.delete(stage)
      } else {
        const remaining = stages.filter((item) => !hidden.has(item)).length
        if (remaining <= MIN_VISIBLE_STAGES) return prev
        hidden.add(stage)
      }
      return stages.filter((item) => hidden.has(item))
    })
  }

  const timeRange = useMemo(
    () =>
      computeTimeRange(
        getDefaultDays(props.filters?.time_granularity),
        props.filters?.start_timestamp,
        props.filters?.end_timestamp
      ),
    [
      props.filters?.end_timestamp,
      props.filters?.start_timestamp,
      props.filters?.time_granularity,
    ]
  )
  const flowQueryParams = useMemo(
    () => buildQueryParams(timeRange, props.filters),
    [props.filters, timeRange]
  )

  const {
    data: flowRows,
    error: flowError,
    isError,
    isLoading,
  } = useQuery({
    queryKey: ['dashboard', 'flow', flowQueryParams, flowRole],
    queryFn: () => getFlowQuotaDates(flowQueryParams, isAdmin),
    select: (res) =>
      requireSuccessfulFlowRows(res, t('Please try again later.')),
    staleTime: 60_000,
  })

  const maskSensitive = props.sensitiveVisible === false
  const flowData = useMemo(
    () =>
      buildDashboardFlowData(isLoading ? [] : (flowRows ?? []), metric, {
        role: flowRole,
        selectedUsers,
        selectedNodes,
        activeNode: activeFlowNode,
        activeLink: activeFlowLink,
        visibleStages,
        topNodeLimit,
        overflowMode,
        maskSensitive,
        deletedTokenLabel: (tokenId) => t('Deleted ({{id}})', { id: tokenId }),
        otherNodeLabel: (kind) => t(FLOW_OTHER_NODE_LABEL_KEYS[kind]),
      }),
    [
      flowRole,
      flowRows,
      isLoading,
      metric,
      overflowMode,
      activeFlowNode,
      activeFlowLink,
      selectedNodes,
      selectedUsers,
      topNodeLimit,
      visibleStages,
      maskSensitive,
      t,
    ]
  )
  const userFilterOptions = useMemo(
    () =>
      flowData.filterOptions.users.map((user) => ({
        label: `${user.label} · ${user.valueLabel}`,
        value: user.value,
      })),
    [flowData.filterOptions.users]
  )
  const nodeFilterStages = useMemo(
    () => visibleStages.filter((stage) => stage !== 'user'),
    [visibleStages]
  )
  const nodeFilterOptions = useMemo(
    () =>
      flowData.filterOptions.nodes.filter((option) => option.kind !== 'user'),
    [flowData.filterOptions.nodes]
  )
  const metricLabel = t(FLOW_METRIC_LABEL_KEYS[metric])
  const formatNodeMetricValue = useCallback(
    (value: number) =>
      metric === 'quota' ? formatQuota(value) : formatFlowMetricNumber(value),
    [metric]
  )
  // Explicit filters (the chips/dropdown control) narrow the rows that feed the
  // chart. They are intentionally independent from the click-to-highlight state
  // below so selecting a filter never dims a node, it removes unrelated rows.
  const toggleFlowNodeFilter = useCallback((filter: FlowNodeFilter) => {
    if (filter.kind === 'user') {
      setSelectedUsers((prev) => toggleSelectedValue(prev, filter.id))
      return
    }
    setSelectedNodes((prev) => toggleSelectedNodeFilter(prev, filter))
  }, [])
  const removeFlowNodeFilter = useCallback((filter: FlowNodeFilter) => {
    if (filter.kind === 'user') {
      setSelectedUsers((prev) => prev.filter((item) => item !== filter.id))
      return
    }
    const key = flowNodeFilterKey(filter)
    setSelectedNodes((prev) =>
      prev.filter((item) => flowNodeFilterKey(item) !== key)
    )
  }, [])
  const clearFlowNodeFilters = useCallback(() => {
    setSelectedNodes([])
  }, [])
  // Clicking a node only drives the highlight: keep every node/link on screen
  // but emphasize the full paths through the clicked node and dim the rest.
  // Clicking the active node again, or clicking empty space, clears it.
  const handleChartPointerDown = useCallback((event: FlowChartPointerEvent) => {
    const datum = flowChartEventDatum(event)
    const filter = flowNodeFilterFromSankeyDatum(datum)
    if (filter) {
      setActiveFlowLink(undefined)
      setActiveFlowNode((prev) =>
        isSameFlowNodeFilter(prev, filter) ? undefined : filter
      )
      return
    }

    const source = flowSankeyDatumValue(datum, 'source')
    const target = flowSankeyDatumValue(datum, 'target')
    if (typeof source === 'string' && typeof target === 'string') {
      setActiveFlowNode(undefined)
      setActiveFlowLink((prev) =>
        prev && prev.source === source && prev.target === target
          ? undefined
          : { source, target }
      )
      return
    }

    setActiveFlowNode(undefined)
    setActiveFlowLink(undefined)
    chartInstanceRef.current?.clearState('selected')
    chartInstanceRef.current?.clearState('blur')
  }, [])
  const chartTitle = t('Flow')
  const flowSpec = useMemo(
    () =>
      buildFlowSankeySpec(flowData.flow, chartTitle, formatQuota, {
        quota: t('Quota'),
        tokens: t('Tokens'),
        requests: t('Requests'),
        share: t('Share'),
      }),
    [chartTitle, flowData.flow, t]
  )
  const chartTheme = resolvedTheme === 'dark' ? 'dark' : 'light'
  const chartKey = [
    metric,
    topNodeLimit,
    overflowMode,
    flowRole,
    activeFlowNode ? flowNodeFilterKey(activeFlowNode) : '',
    activeFlowLink
      ? `${activeFlowLink.source}\u0000${activeFlowLink.target}`
      : '',
    selectedNodes.map(flowNodeFilterKey).join(','),
    selectedUsers.join(','),
    visibleStages.join(','),
    maskSensitive ? 'masked' : 'plain',
    flowRows?.length ?? 0,
    resolvedTheme,
  ].join('-')
  const displayState = flowDisplayState({
    isLoading,
    isError,
    linkCount: flowData.flow.links.length,
    themeReady,
  })
  const flowErrorMessage =
    flowError instanceof Error
      ? flowError.message
      : t('Please try again later.')

  return {
    chartInstanceRef,
    isAdmin,
    metric,
    setMetric,
    topNodeLimit,
    setTopNodeLimit,
    overflowMode,
    setOverflowMode,
    selectedUsers,
    setSelectedUsers,
    selectedNodes,
    hiddenStages,
    stages,
    toggleStage,
    isLoading,
    userFilterOptions,
    nodeFilterStages,
    nodeFilterOptions,
    metricLabel,
    formatNodeMetricValue,
    toggleFlowNodeFilter,
    removeFlowNodeFilter,
    clearFlowNodeFilters,
    handleChartPointerDown,
    chartTitle,
    flowSpec,
    chartTheme,
    chartKey,
    displayState,
    flowErrorMessage,
  }
}
