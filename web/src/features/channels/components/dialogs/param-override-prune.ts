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
import { CONDITION_MODE_VALUES } from './param-override-definitions'
import {
  nextLocalId,
  toValueText,
  parseLooseValue,
} from './param-override-values'

// prune_objects helpers

export type PruneRule = {
  id: string
  path: string
  mode: string
  value_text: string
  invert: boolean
  pass_missing_key: boolean
}

export type PruneObjectsDraft = {
  simpleMode: boolean
  typeText: string
  logic: string
  recursive: boolean
  rules: PruneRule[]
}

export const normalizePruneRule = (
  rule: Record<string, unknown> = {}
): PruneRule => ({
  id: nextLocalId(),
  path: typeof rule.path === 'string' ? rule.path : '',
  mode: CONDITION_MODE_VALUES.has(rule.mode as string)
    ? (rule.mode as string)
    : 'full',
  value_text: toValueText(rule.value),
  invert: rule.invert === true,
  pass_missing_key: rule.pass_missing_key === true,
})

export const parsePruneObjectsDraft = (
  valueText: string
): PruneObjectsDraft => {
  const defaults: PruneObjectsDraft = {
    simpleMode: true,
    typeText: '',
    logic: 'AND',
    recursive: true,
    rules: [],
  }
  const raw = String(valueText ?? '').trim()
  if (!raw) return defaults
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'string') {
      return { ...defaults, typeText: parsed.trim() }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const rules: PruneRule[] = []
      if (
        parsed.where &&
        typeof parsed.where === 'object' &&
        !Array.isArray(parsed.where)
      ) {
        for (const [path, value] of Object.entries(
          parsed.where as Record<string, unknown>
        )) {
          rules.push(normalizePruneRule({ path, mode: 'full', value }))
        }
      }
      if (Array.isArray(parsed.conditions)) {
        for (const item of parsed.conditions) {
          if (item && typeof item === 'object') {
            rules.push(normalizePruneRule(item))
          }
        }
      } else if (
        parsed.conditions &&
        typeof parsed.conditions === 'object' &&
        !Array.isArray(parsed.conditions)
      ) {
        for (const [path, value] of Object.entries(
          parsed.conditions as Record<string, unknown>
        )) {
          rules.push(normalizePruneRule({ path, mode: 'full', value }))
        }
      }
      const typeText =
        parsed.type === undefined ? '' : String(parsed.type).trim()
      const logic =
        String(parsed.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND'
      const recursive = parsed.recursive !== false
      const hasAdvancedFields =
        parsed.logic !== undefined ||
        parsed.recursive !== undefined ||
        parsed.where !== undefined ||
        parsed.conditions !== undefined
      return {
        ...defaults,
        simpleMode: !hasAdvancedFields,
        typeText,
        logic,
        recursive,
        rules,
      }
    }
    return { ...defaults, typeText: String(parsed ?? '').trim() }
  } catch {
    return { ...defaults, typeText: raw }
  }
}

export const buildPruneObjectsValueText = (
  draft: PruneObjectsDraft
): string => {
  const typeText = String(draft.typeText || '').trim()
  if (draft.simpleMode) return typeText
  const payload: Record<string, unknown> = {}
  if (typeText) payload.type = typeText
  if (String(draft.logic || 'AND').toUpperCase() === 'OR') payload.logic = 'OR'
  if (draft.recursive === false) payload.recursive = false
  const conditions = (draft.rules || [])
    .filter((rule) => String(rule.path || '').trim())
    .map((rule) => {
      const conditionPayload: Record<string, unknown> = {
        path: String(rule.path || '').trim(),
        mode: CONDITION_MODE_VALUES.has(rule.mode) ? rule.mode : 'full',
      }
      const valueRaw = String(rule.value_text || '').trim()
      if (valueRaw !== '') conditionPayload.value = parseLooseValue(valueRaw)
      if (rule.invert) conditionPayload.invert = true
      if (rule.pass_missing_key) conditionPayload.pass_missing_key = true
      return conditionPayload
    })
  if (conditions.length > 0) payload.conditions = conditions
  if (!payload.type && !payload.conditions) {
    return JSON.stringify({ logic: 'AND' })
  }
  return JSON.stringify(payload)
}
