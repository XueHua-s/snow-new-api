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
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParamOverrideCondition = {
  id: string
  path: string
  mode: string
  value_text: string
  invert: boolean
  pass_missing_key: boolean
}

export type ParamOverrideOperation = {
  id: string
  description: string
  path: string
  mode: string
  from: string
  to: string
  value_text: string
  keep_origin: boolean
  logic: string
  conditions: ParamOverrideCondition[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const OPERATION_MODE_OPTIONS = [
  { label: 'Set Field', value: 'set' },
  { label: 'Delete Field', value: 'delete' },
  { label: 'Append to End', value: 'append' },
  { label: 'Prepend to Start', value: 'prepend' },
  { label: 'Copy Field', value: 'copy' },
  { label: 'Move Field', value: 'move' },
  { label: 'String Replace', value: 'replace' },
  { label: 'Regex Replace', value: 'regex_replace' },
  { label: 'Trim Prefix', value: 'trim_prefix' },
  { label: 'Trim Suffix', value: 'trim_suffix' },
  { label: 'Ensure Prefix', value: 'ensure_prefix' },
  { label: 'Ensure Suffix', value: 'ensure_suffix' },
  { label: 'Trim Space', value: 'trim_space' },
  { label: 'To Lowercase', value: 'to_lower' },
  { label: 'To Uppercase', value: 'to_upper' },
  { label: 'Return Custom Error', value: 'return_error' },
  { label: 'Prune Object Items', value: 'prune_objects' },
  { label: 'Pass Through Headers', value: 'pass_headers' },
  { label: 'Sync Fields', value: 'sync_fields' },
  { label: 'Set Request Header', value: 'set_header' },
  { label: 'Delete Request Header', value: 'delete_header' },
  { label: 'Copy Request Header', value: 'copy_header' },
  { label: 'Move Request Header', value: 'move_header' },
]

export const OPERATION_MODE_VALUES = new Set(
  OPERATION_MODE_OPTIONS.map((o) => o.value)
)

export const OPERATION_MODE_LABEL_MAP = OPERATION_MODE_OPTIONS.reduce<
  Record<string, string>
>((acc, item) => {
  acc[item.value] = item.label
  return acc
}, {})

export const CONDITION_MODE_OPTIONS = [
  { label: 'Exact Match', value: 'full' },
  { label: 'Prefix', value: 'prefix' },
  { label: 'Suffix', value: 'suffix' },
  { label: 'Contains', value: 'contains' },
  { label: 'Greater Than', value: 'gt' },
  { label: 'Greater Than or Equal', value: 'gte' },
  { label: 'Less Than', value: 'lt' },
  { label: 'Less Than or Equal', value: 'lte' },
]

export const CONDITION_MODE_VALUES = new Set(
  CONDITION_MODE_OPTIONS.map((o) => o.value)
)

export const MODE_META: Record<
  string,
  {
    path?: boolean
    pathOptional?: boolean
    value?: boolean
    from?: boolean
    to?: boolean
    keepOrigin?: boolean
    pathAlias?: boolean
  }
> = {
  delete: { path: true },
  set: { path: true, value: true, keepOrigin: true },
  append: { path: true, value: true, keepOrigin: true },
  prepend: { path: true, value: true, keepOrigin: true },
  copy: { from: true, to: true },
  move: { from: true, to: true },
  replace: { path: true, from: true, to: false },
  regex_replace: { path: true, from: true, to: false },
  trim_prefix: { path: true, value: true },
  trim_suffix: { path: true, value: true },
  ensure_prefix: { path: true, value: true },
  ensure_suffix: { path: true, value: true },
  trim_space: { path: true },
  to_lower: { path: true },
  to_upper: { path: true },
  return_error: { value: true },
  prune_objects: { pathOptional: true, value: true },
  pass_headers: { value: true, keepOrigin: true },
  sync_fields: { from: true, to: true },
  set_header: { path: true, value: true, keepOrigin: true },
  delete_header: { path: true },
  copy_header: { from: true, to: true, keepOrigin: true, pathAlias: true },
  move_header: { from: true, to: true, keepOrigin: true, pathAlias: true },
}

export const VALUE_REQUIRED_MODES = new Set([
  'trim_prefix',
  'trim_suffix',
  'ensure_prefix',
  'ensure_suffix',
  'set_header',
  'return_error',
  'prune_objects',
  'pass_headers',
])

export const FROM_REQUIRED_MODES = new Set([
  'copy',
  'move',
  'replace',
  'regex_replace',
  'copy_header',
  'move_header',
  'sync_fields',
])

export const TO_REQUIRED_MODES = new Set([
  'copy',
  'move',
  'copy_header',
  'move_header',
  'sync_fields',
])

export const MODE_DESCRIPTIONS: Record<string, string> = {
  set: 'Write value to the target field',
  delete: 'Remove the target field',
  append: 'Append value to array / string / object end',
  prepend: 'Prepend value to array / string / object start',
  copy: 'Copy source field to target field',
  move: 'Move source field to target field',
  replace: 'Do string replacement in the target field',
  regex_replace: 'Do regex replacement in the target field',
  trim_prefix: 'Remove string prefix',
  trim_suffix: 'Remove string suffix',
  ensure_prefix: 'Ensure the string has a specified prefix',
  ensure_suffix: 'Ensure the string has a specified suffix',
  trim_space: 'Trim leading/trailing whitespace',
  to_lower: 'Convert string to lowercase',
  to_upper: 'Convert string to uppercase',
  return_error: 'Return a custom error immediately',
  prune_objects: 'Prune object items by conditions',
  pass_headers: 'Pass specified request headers to upstream',
  sync_fields: 'Auto-fill when one field exists and another is missing',
  set_header:
    'Set runtime request header: override entire value, or manipulate comma-separated tokens',
  delete_header: 'Delete a runtime request header',
  copy_header: 'Copy a request header',
  move_header: 'Move a request header',
}

export const SYNC_TARGET_TYPE_OPTIONS = [
  { label: 'Request Body Field', value: 'json' },
  { label: 'Request Header Field', value: 'header' },
]
