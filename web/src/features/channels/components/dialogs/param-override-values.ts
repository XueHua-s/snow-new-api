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
import {
  type ParamOverrideCondition,
  CONDITION_MODE_VALUES,
  type ParamOverrideOperation,
  OPERATION_MODE_VALUES,
  OPERATION_MODE_LABEL_MAP,
} from './param-override-definitions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let localIdSeed = 0

export const nextLocalId = () => `po_${Date.now()}_${localIdSeed++}`

export const toValueText = (value: unknown): string => {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const parseLooseValue = (valueText: string): unknown => {
  const raw = String(valueText ?? '').trim()
  if (raw === '') return ''
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export const verifyJSON = (text: string): boolean => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

const normalizeCondition = (
  condition: Record<string, unknown> = {}
): ParamOverrideCondition => ({
  id: nextLocalId(),
  path: typeof condition.path === 'string' ? condition.path : '',
  mode: CONDITION_MODE_VALUES.has(condition.mode as string)
    ? (condition.mode as string)
    : 'full',
  value_text: toValueText(condition.value),
  invert: condition.invert === true,
  pass_missing_key: condition.pass_missing_key === true,
})

export const createDefaultCondition = (): ParamOverrideCondition =>
  normalizeCondition({})

export const normalizeOperation = (
  operation: Record<string, unknown> = {}
): ParamOverrideOperation => ({
  id: nextLocalId(),
  description:
    typeof operation.description === 'string' ? operation.description : '',
  path: typeof operation.path === 'string' ? operation.path : '',
  mode: OPERATION_MODE_VALUES.has(operation.mode as string)
    ? (operation.mode as string)
    : 'set',
  value_text: toValueText(operation.value),
  keep_origin: operation.keep_origin === true,
  from: typeof operation.from === 'string' ? operation.from : '',
  to: typeof operation.to === 'string' ? operation.to : '',
  logic: String(operation.logic || 'OR').toUpperCase() === 'AND' ? 'AND' : 'OR',
  conditions: Array.isArray(operation.conditions)
    ? (operation.conditions as Record<string, unknown>[]).map(
        normalizeCondition
      )
    : [],
})

export const createDefaultOperation = (): ParamOverrideOperation =>
  normalizeOperation({ mode: 'set' })

export const reorderOperations = (
  ops: ParamOverrideOperation[],
  sourceId: string,
  targetId: string,
  position: 'before' | 'after' = 'before'
): ParamOverrideOperation[] => {
  if (!sourceId || !targetId || sourceId === targetId) return ops
  const srcIdx = ops.findIndex((o) => o.id === sourceId)
  if (srcIdx < 0) return ops
  const next = [...ops]
  const [moved] = next.splice(srcIdx, 1)
  let insertIdx = next.findIndex((o) => o.id === targetId)
  if (insertIdx < 0) return ops
  if (position === 'after') insertIdx += 1
  next.splice(insertIdx, 0, moved)
  return next
}

export const isOperationBlank = (
  operation: ParamOverrideOperation
): boolean => {
  const hasCondition = operation.conditions.some(
    (c) =>
      c.path.trim() ||
      c.value_text.trim() ||
      c.mode !== 'full' ||
      c.invert ||
      c.pass_missing_key
  )
  return (
    operation.mode === 'set' &&
    !operation.path.trim() &&
    !operation.from.trim() &&
    !operation.to.trim() &&
    operation.value_text.trim() === '' &&
    !operation.keep_origin &&
    !hasCondition
  )
}

export const getOperationSummary = (
  operation: ParamOverrideOperation,
  index: number
): string => {
  const mode = operation.mode || 'set'
  const modeLabel = OPERATION_MODE_LABEL_MAP[mode] || mode
  if (mode === 'sync_fields') {
    const from = operation.from.trim()
    const to = operation.to.trim()
    return `${index + 1}. ${modeLabel} · ${from || to || '-'}`
  }
  const path = operation.path.trim()
  const from = operation.from.trim()
  const to = operation.to.trim()
  return `${index + 1}. ${modeLabel} · ${path || from || to || '-'}`
}

export const getModeTagTailwind = (mode: string): string => {
  if (mode.includes('header')) {
    return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/20'
  }
  if (mode.includes('replace') || mode.includes('trim')) {
    return 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/20'
  }
  if (mode.includes('copy') || mode.includes('move')) {
    return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20'
  }
  if (mode.includes('error') || mode.includes('prune')) {
    return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/20'
  }
  if (mode.includes('sync')) {
    return 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/20'
  }
  return 'bg-muted text-muted-foreground'
}

export const getModePathLabel = (mode: string): string => {
  if (mode === 'set_header' || mode === 'delete_header') return 'Header Name'
  if (mode === 'prune_objects') return 'Target Path (optional)'
  return 'Target Field Path'
}

export const getModePathPlaceholder = (mode: string): string => {
  if (mode === 'set_header') return 'Authorization'
  if (mode === 'delete_header') return 'X-Debug-Mode'
  if (mode === 'prune_objects') return 'messages'
  return 'temperature'
}

export const getModeFromLabel = (mode: string): string => {
  if (mode === 'replace') return 'Match Text'
  if (mode === 'regex_replace') return 'Regex Pattern'
  if (mode === 'copy_header' || mode === 'move_header') return 'Source Header'
  return 'Source Field'
}

export const getModeFromPlaceholder = (mode: string): string => {
  if (mode === 'replace') return 'openai/'
  if (mode === 'regex_replace') return '^gpt-'
  if (mode === 'copy_header' || mode === 'move_header') return 'Authorization'
  return 'model'
}

export const getModeToLabel = (mode: string): string => {
  if (mode === 'replace' || mode === 'regex_replace') return 'Replace With'
  if (mode === 'copy_header' || mode === 'move_header') return 'Target Header'
  return 'Target Field'
}

export const getModeToPlaceholder = (mode: string): string => {
  if (mode === 'replace') return '(leave empty to delete)'
  if (mode === 'regex_replace') return 'openai/gpt-'
  if (mode === 'copy_header' || mode === 'move_header') return 'X-Upstream-Auth'
  return 'original_model'
}

export const getModeValueLabel = (mode: string): string => {
  if (mode === 'set_header') {
    return 'Header Value (supports string or JSON mapping)'
  }
  if (mode === 'pass_headers') {
    return 'Pass-through Headers (comma-separated or JSON array)'
  }
  if (
    mode === 'trim_prefix' ||
    mode === 'trim_suffix' ||
    mode === 'ensure_prefix' ||
    mode === 'ensure_suffix'
  ) {
    return 'Prefix/Suffix Text'
  }
  if (mode === 'prune_objects') return 'Prune Rule (string or JSON object)'
  return 'Value (supports JSON or plain text)'
}

export const getModeValuePlaceholder = (mode: string): string => {
  if (mode === 'set_header') return 'Bearer sk-xxx'
  if (mode === 'pass_headers') return 'Authorization, X-Request-Id'
  if (
    mode === 'trim_prefix' ||
    mode === 'trim_suffix' ||
    mode === 'ensure_prefix' ||
    mode === 'ensure_suffix'
  ) {
    return 'openai/'
  }
  if (mode === 'prune_objects') return '{"type":"redacted_thinking"}'
  return '0.7'
}

export const parseSyncTargetSpec = (
  spec: string
): { type: string; key: string } => {
  const raw = String(spec ?? '').trim()
  if (!raw) return { type: 'json', key: '' }
  const idx = raw.indexOf(':')
  if (idx < 0) return { type: 'json', key: raw }
  const prefix = raw.slice(0, idx).trim().toLowerCase()
  const key = raw.slice(idx + 1).trim()
  return prefix === 'header' ? { type: 'header', key } : { type: 'json', key }
}

export const buildSyncTargetSpec = (type: string, key: string): string => {
  const normalizedType = type === 'header' ? 'header' : 'json'
  const normalizedKey = String(key ?? '').trim()
  if (!normalizedKey) return ''
  return `${normalizedType}:${normalizedKey}`
}
