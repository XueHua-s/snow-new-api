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
import { describe, expect, test } from 'vitest'

import { groupModels } from './lib'
import type { ChannelStatusModel } from './types'

function statusModel(
  model: string,
  section: string,
  averageTTFT: number
): ChannelStatusModel {
  return {
    model,
    section,
    family: 'OpenAI',
    avg_ttft_ms: averageTTFT,
    min_ttft_ms: averageTTFT,
    max_ttft_ms: averageTTFT,
    avg_resp_sec: 1,
    success_rate: 100,
    error_rate: 0,
    empty_rate: 0,
    health: section === 'available' ? 'idle' : 'good',
    request_state: section === 'available' ? 'no_requests' : 'active',
    groups: ['svip', 'default'],
  }
}

describe('groupModels', () => {
  test('preserves the status of the same model in each telemetry section', () => {
    const sections = groupModels([
      statusModel('gpt-5.6-sol', 'PROMAX', 9000),
      statusModel('gpt-5.6-sol', '普通分组', 2000),
      statusModel('gpt-idle', 'available', 0),
    ])

    expect(sections.map((section) => section.section)).toEqual([
      '普通分组',
      'PROMAX',
      'available',
    ])
    expect(sections.map((section) => section.modelCount)).toEqual([1, 1, 1])
    expect(sections[0].description).toBe('default · svip')
    expect(sections[0].families[0].models[0].avg_ttft_ms).toBe(2000)
    expect(sections[1].families[0].models[0].avg_ttft_ms).toBe(9000)
  })
})
