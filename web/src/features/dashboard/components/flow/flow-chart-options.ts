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
import { Activity, Hash, WalletCards } from 'lucide-react'

import type { FlowMetric, FlowNodeKind } from '@/features/dashboard/types'

export const FLOW_METRIC_OPTIONS = [
  { value: 'quota', labelKey: 'By quota', icon: WalletCards },
  { value: 'tokens', labelKey: 'By tokens', icon: Hash },
  { value: 'requests', labelKey: 'By requests', icon: Activity },
] as const

export const FLOW_METRIC_LABEL_KEYS: Record<FlowMetric, string> = {
  quota: 'Quota',
  tokens: 'Tokens',
  requests: 'Requests',
}

export const FLOW_TOP_LIMIT_OPTIONS = [10, 20, 50, 100] as const

export const DEFAULT_FLOW_TOP_NODE_LIMIT = 50

export const FLOW_OVERFLOW_MODE_OPTIONS = [
  { value: 'aggregate', labelKey: 'Merge into Other' },
  { value: 'hide', labelKey: 'Hide' },
] as const

// A Sankey needs at least two columns to render any link.
export const MIN_VISIBLE_STAGES = 2

export const FLOW_STAGE_META: Record<
  FlowNodeKind,
  { labelKey: string; descKey: string }
> = {
  user: {
    labelKey: 'User',
    descKey: 'The user who made the requests',
  },
  node: {
    labelKey: 'Node',
    descKey: 'The deployment node that handled the requests',
  },
  token: {
    labelKey: 'Token',
    descKey: 'The API key used for the requests',
  },
  group: {
    labelKey: 'Group',
    descKey: 'The user group applied to the requests',
  },
  model: {
    labelKey: 'Model',
    descKey: 'The model that was requested',
  },
  channel: {
    labelKey: 'Channel',
    descKey: 'The upstream channel that served the requests',
  },
}

export const FLOW_STAGE_LABEL_KEYS: Record<FlowNodeKind, string> = {
  user: FLOW_STAGE_META.user.labelKey,
  node: FLOW_STAGE_META.node.labelKey,
  token: FLOW_STAGE_META.token.labelKey,
  group: FLOW_STAGE_META.group.labelKey,
  model: FLOW_STAGE_META.model.labelKey,
  channel: FLOW_STAGE_META.channel.labelKey,
}

export const FLOW_OTHER_NODE_LABEL_KEYS: Record<FlowNodeKind, string> = {
  user: 'Other users',
  node: 'Other nodes',
  token: 'Other tokens',
  group: 'Other groups',
  model: 'Other models',
  channel: 'Other channels',
}

export function formatFlowMetricNumber(value: number): string {
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value
  )
}
