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
export const ADVANCED_CUSTOM_MODEL_REGEX_PREFIX = 're:'

export type AdvancedCustomModelRuleKind = 'exact' | 'regex'

export function parseAdvancedCustomRouteModels(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean)
    ),
  ]
}

export function getAdvancedCustomModelRuleKind(
  modelRule: string
): AdvancedCustomModelRuleKind {
  return modelRule.startsWith(ADVANCED_CUSTOM_MODEL_REGEX_PREFIX)
    ? 'regex'
    : 'exact'
}

export function getAdvancedCustomRegexModelPattern(modelRule: string): string {
  return modelRule.slice(ADVANCED_CUSTOM_MODEL_REGEX_PREFIX.length)
}

export function normalizeAdvancedCustomRouteModels(
  models: string[] | undefined
): string[] {
  if (!Array.isArray(models)) return []
  return models.map((model) => model.trim()).filter(Boolean)
}
