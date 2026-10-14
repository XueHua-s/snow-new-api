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
  type ParamOverrideOperation,
  MODE_META,
  FROM_REQUIRED_MODES,
  TO_REQUIRED_MODES,
  VALUE_REQUIRED_MODES,
} from './param-override-definitions'
import {
  parseLooseValue,
  createDefaultOperation,
  verifyJSON,
  normalizeOperation,
  isOperationBlank,
} from './param-override-values'

// pass_headers helpers

const parsePassHeaderNames = (rawValue: unknown): string[] => {
  if (Array.isArray(rawValue)) {
    return rawValue.map((i) => String(i ?? '').trim()).filter(Boolean)
  }
  if (rawValue && typeof rawValue === 'object') {
    const obj = rawValue as Record<string, unknown>
    if (Array.isArray(obj.headers)) {
      return obj.headers.map((i) => String(i ?? '').trim()).filter(Boolean)
    }
    if (obj.header !== undefined) {
      const single = String(obj.header ?? '').trim()
      return single ? [single] : []
    }
    return []
  }
  if (typeof rawValue === 'string') {
    return rawValue
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean)
  }
  return []
}

// Condition payload builder
const buildConditionPayload = (
  condition: ParamOverrideCondition
): Record<string, unknown> | null => {
  const path = condition.path.trim()
  if (!path) return null
  const payload: Record<string, unknown> = {
    path,
    mode: condition.mode || 'full',
    value: parseLooseValue(condition.value_text),
  }
  if (condition.invert) payload.invert = true
  if (condition.pass_missing_key) payload.pass_missing_key = true
  return payload
}

// Validation

const validateOperations = (
  operations: ParamOverrideOperation[],
  t: (key: string, options?: Record<string, unknown>) => string
): string => {
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]
    const mode = op.mode || 'set'
    const meta = MODE_META[mode] || MODE_META.set
    const line = i + 1
    const pathValue = op.path.trim()
    const fromValue = op.from.trim()
    const toValue = op.to.trim()

    if (meta.path && !pathValue) {
      return t('Rule {{line}} is missing target path', { line })
    }
    if (FROM_REQUIRED_MODES.has(mode) && !fromValue) {
      if (!(meta.pathAlias && pathValue)) {
        return t('Rule {{line}} is missing source field', { line })
      }
    }
    if (TO_REQUIRED_MODES.has(mode) && !toValue) {
      if (!(meta.pathAlias && pathValue)) {
        return t('Rule {{line}} is missing target field', { line })
      }
    }
    if (VALUE_REQUIRED_MODES.has(mode) && op.value_text.trim() === '') {
      return t('Rule {{line}} is missing value', { line })
    }

    if (mode === 'return_error') {
      const raw = op.value_text.trim()
      if (!raw) return t('Rule {{line}} is missing value', { line })
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          if (
            !String((parsed as Record<string, unknown>).message || '').trim()
          ) {
            return t('Rule {{line}} return_error requires a message field', {
              line,
            })
          }
        }
      } catch {
        /* plain string is allowed */
      }
    }

    if (mode === 'prune_objects') {
      const raw = op.value_text.trim()
      if (!raw) {
        return t('Rule {{line}} prune_objects is missing conditions', { line })
      }
    }

    if (mode === 'pass_headers') {
      const raw = op.value_text.trim()
      if (!raw) {
        return t('Rule {{line}} pass_headers is missing header names', { line })
      }
      const parsed = parseLooseValue(raw)
      const headers = parsePassHeaderNames(parsed)
      if (headers.length === 0) {
        return t('Rule {{line}} pass_headers format is invalid', { line })
      }
    }
  }
  return ''
}

// Parse initial state

type EditorState = {
  editMode: 'visual' | 'json'
  visualMode: 'operations' | 'legacy'
  legacyValue: string
  operations: ParamOverrideOperation[]
  jsonText: string
  jsonError: string
}

export const parseInitialState = (rawValue: string): EditorState => {
  const text = typeof rawValue === 'string' ? rawValue : ''
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      editMode: 'visual',
      visualMode: 'operations',
      legacyValue: '',
      operations: [createDefaultOperation()],
      jsonText: '',
      jsonError: '',
    }
  }

  if (!verifyJSON(trimmed)) {
    return {
      editMode: 'json',
      visualMode: 'operations',
      legacyValue: '',
      operations: [createDefaultOperation()],
      jsonText: text,
      jsonError: 'Invalid JSON format',
    }
  }

  const parsed = JSON.parse(trimmed) as Record<string, unknown>
  const pretty = JSON.stringify(parsed, null, 2)

  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Array.isArray(parsed.operations)
  ) {
    return {
      editMode: 'visual',
      visualMode: 'operations',
      legacyValue: '',
      operations:
        (parsed.operations as Record<string, unknown>[]).length > 0
          ? (parsed.operations as Record<string, unknown>[]).map(
              normalizeOperation
            )
          : [createDefaultOperation()],
      jsonText: pretty,
      jsonError: '',
    }
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return {
      editMode: 'visual',
      visualMode: 'legacy',
      legacyValue: pretty,
      operations: [createDefaultOperation()],
      jsonText: pretty,
      jsonError: '',
    }
  }

  return {
    editMode: 'json',
    visualMode: 'operations',
    legacyValue: '',
    operations: [createDefaultOperation()],
    jsonText: pretty,
    jsonError: '',
  }
}

// Build operations JSON

export const buildOperationsJson = (
  sourceOperations: ParamOverrideOperation[],
  options: { validate: boolean },
  t: (key: string, options?: Record<string, unknown>) => string
): string => {
  const filteredOps = sourceOperations.filter((o) => !isOperationBlank(o))
  if (filteredOps.length === 0) return ''

  if (options.validate) {
    const message = validateOperations(filteredOps, t)
    if (message) throw new Error(message)
  }

  const payloadOps = filteredOps.map((operation) => {
    const mode = operation.mode || 'set'
    const meta = MODE_META[mode] || MODE_META.set
    const descriptionValue = String(operation.description || '').trim()
    const pathValue = operation.path.trim()
    const fromValue = operation.from.trim()
    const toValue = operation.to.trim()
    const payload: Record<string, unknown> = { mode }
    if (descriptionValue) payload.description = descriptionValue
    if (meta.path) payload.path = pathValue
    if (meta.pathOptional && pathValue) payload.path = pathValue
    if (meta.value) payload.value = parseLooseValue(operation.value_text)
    if (meta.keepOrigin && operation.keep_origin) payload.keep_origin = true
    if (meta.from) payload.from = fromValue
    if (!meta.to && operation.to.trim()) payload.to = toValue
    if (meta.to) payload.to = toValue
    if (meta.pathAlias) {
      if (!payload.from && pathValue) payload.from = pathValue
      if (!payload.to && pathValue) payload.to = pathValue
    }
    const conditions = operation.conditions
      .map(buildConditionPayload)
      .filter(Boolean)
    if (conditions.length > 0) {
      payload.conditions = conditions
      payload.logic = operation.logic === 'AND' ? 'AND' : 'OR'
    }
    return payload
  })

  return JSON.stringify({ operations: payloadOps }, null, 2)
}
