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
  FlowMetric,
  FlowQuotaDataItem,
  FlowSummary,
  ProcessedFlowData,
} from '@/features/dashboard/types'

import {
  filterRows,
  filterRowsByNodes,
  buildUserFilterOptions,
  buildNodeFilterOptions,
} from './flow-filters'
import { buildFlowGraph } from './flow-graph'
import {
  rowMetrics,
  DEFAULT_FLOW_ROLE,
  resolveVisibleStages,
} from './flow-paths'

function buildSummary(rows: FlowQuotaDataItem[]): FlowSummary {
  return rows.reduce<FlowSummary>(
    (summary, row) => {
      const metrics = rowMetrics(row)
      summary.quota += metrics.quota
      summary.tokens += metrics.tokens
      summary.requests += metrics.requests
      return summary
    },
    {
      quota: 0,
      tokens: 0,
      requests: 0,
    }
  )
}

export function buildDashboardFlowData(
  rows: FlowQuotaDataItem[],
  metric: FlowMetric = 'quota',
  options: FlowBuildOptions = {}
): ProcessedFlowData {
  const role = options.role ?? DEFAULT_FLOW_ROLE
  const palette = options.colorPalette
  const ctx = {
    deletedTokenLabel: options.deletedTokenLabel,
  }
  const stages = resolveVisibleStages(role, options.visibleStages)
  const userFilteredRows = filterRows(rows, options)
  const filteredRows = filterRowsByNodes(
    userFilteredRows,
    options.selectedNodes,
    stages,
    ctx
  )

  return {
    summary: buildSummary(filteredRows),
    flow: buildFlowGraph(
      filteredRows,
      metric,
      role,
      palette,
      options.visibleStages,
      ctx,
      {
        topNodeLimit: options.topNodeLimit,
        overflowMode: options.overflowMode,
        otherNodeLabel: options.otherNodeLabel,
        activeNode: options.activeNode,
        activeLink: options.activeLink,
        maskSensitive: options.maskSensitive,
      }
    ),
    filterOptions: {
      users: buildUserFilterOptions(rows, metric, palette),
      nodes: buildNodeFilterOptions(
        userFilteredRows,
        metric,
        role,
        options.visibleStages,
        palette,
        ctx,
        options.selectedNodes
      ),
    },
  }
}

export { getFlowStages } from './flow-paths'
export { buildFlowFilterOptions } from './flow-filters'
export {
  flowSankeyDatumValue,
  flowNodeFilterFromSankeyDatum,
  buildFlowSankeySpec,
} from './flow-sankey'
