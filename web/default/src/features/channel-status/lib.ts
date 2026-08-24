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
import type { ChannelStatusModel, ChannelStatusSection } from './types'

export const CHANNEL_STATUS_WINDOWS = [
  { label: '60s', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '7d', value: 604800 },
] as const

const FAMILY_ORDER = ['Anthropic', 'OpenAI', 'Venice AI', 'Vivgrid', '其他']

export function formatTTFT(milliseconds?: number): {
  value: string
  unit: string
  text: string
} {
  if (!milliseconds || milliseconds <= 0) {
    return { value: '—', unit: '', text: '—' }
  }
  if (milliseconds < 1000) {
    const value = String(Math.round(milliseconds))
    return { value, unit: 'ms', text: `${value}ms` }
  }
  const value = (milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)
  return { value, unit: 's', text: `${value}s` }
}

export function getVisibleErrors(errors: string[] = []): string[] {
  return errors.filter(
    (error) => !error.toLowerCase().includes('quota exhausted')
  )
}

function orderIndex(order: string[], value: string): number {
  const index = order.indexOf(value)
  return index < 0 ? 999 : index
}

export function groupModels(
  models: ChannelStatusModel[] = []
): ChannelStatusSection[] {
  if (models.length === 0) return []

  const families = new Map<string, ChannelStatusModel[]>()
  const groups = new Set<string>()

  for (const model of models) {
    const familyModels = families.get(model.family) ?? []
    familyModels.push(model)
    families.set(model.family, familyModels)
    for (const group of model.groups ?? []) groups.add(group)
  }

  const orderedGroups = [...groups].sort((left, right) => {
    if (left === right) return 0
    if (left === 'default') return -1
    if (right === 'default') return 1
    return left.localeCompare(right)
  })

  return [
    {
      section: 'available',
      description: orderedGroups.join(' · '),
      families: [...families.entries()]
        .sort(
          ([left], [right]) =>
            orderIndex(FAMILY_ORDER, left) - orderIndex(FAMILY_ORDER, right)
        )
        .map(([family, familyModels]) => ({
          family,
          models: familyModels,
        })),
    },
  ]
}
