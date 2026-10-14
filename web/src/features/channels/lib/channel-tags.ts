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
import type { Channel } from '../types'

// ============================================================================
// Tag Aggregation Utilities
// ============================================================================

/**
 * Tag row type (extends Channel with children)
 */
export type TagRow = Channel & {
  children: Channel[]
}

/**
 * Type guard to check whether a row is a tag aggregate row
 */
export function isTagAggregateRow(row: Channel | TagRow): row is TagRow {
  return Array.isArray((row as TagRow).children)
}

export function getChannelTableRowId(row: Channel | TagRow): string {
  if (isTagAggregateRow(row)) {
    return `tag:${row.tag || ''}`
  }

  return `channel:${row.id}`
}

/**
 * Aggregate channels by tag for tag mode display
 * Converts flat array into tree structure grouped by tag
 */
export function aggregateChannelsByTag(
  channels: Channel[]
): (Channel | TagRow)[] {
  const tagMap = new Map<string, TagRow>()
  const result: (Channel | TagRow)[] = []

  for (const channel of channels) {
    const tag = channel.tag || ''

    if (!tagMap.has(tag)) {
      // Create tag aggregate row
      const tagRow = {
        ...channel,
        key: tag,
        id: tag as unknown as number,
        tag,
        name: tag,
        type: 0,
        status: undefined as unknown as number,
        group: '',
        used_quota: 0,
        response_time: 0,
        priority: -1 as unknown as number | null,
        weight: -1 as unknown as number | null,
        balance: 0,
        test_time: 0,
        created_time: 0,
        balance_updated_time: 0,
        models: '',
        children: [],
      } as TagRow
      tagMap.set(tag, tagRow)
      result.push(tagRow)
    }

    const tagRow = tagMap.get(tag)
    if (!tagRow) {
      continue
    }

    // Add to children
    tagRow.children.push(channel)
    const childCount = tagRow.children.length

    // Aggregate used_quota (sum)
    tagRow.used_quota += channel.used_quota

    // Aggregate response_time (average)
    tagRow.response_time =
      (tagRow.response_time * (childCount - 1) + channel.response_time) /
      childCount

    // Aggregate priority (same value or null if different)
    if (tagRow.priority === -1) {
      tagRow.priority = channel.priority
    } else if (tagRow.priority !== channel.priority) {
      tagRow.priority = null
    }

    // Aggregate weight (same value or null if different)
    if (tagRow.weight === -1) {
      tagRow.weight = channel.weight
    } else if (tagRow.weight !== channel.weight) {
      tagRow.weight = null
    }

    // Aggregate group (concatenate and deduplicate)
    if (tagRow.group === '') {
      tagRow.group = channel.group
    } else {
      const existingGroups = new Set(tagRow.group.split(',').filter(Boolean))
      const newGroups = channel.group.split(',').filter(Boolean)
      newGroups.forEach((g) => {
        if (!existingGroups.has(g)) {
          tagRow.group += `,${g}`
        }
      })
    }

    // Aggregate status (enabled if any child is enabled)
    if (channel.status === 1) {
      tagRow.status = 1
    } else if (tagRow.status === undefined) {
      tagRow.status = channel.status
    }
  }

  return result
}
