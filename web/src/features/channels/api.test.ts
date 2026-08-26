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
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { createChannel, getChannels } from './api'
import type { AddChannelRequest } from './types'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/features/users/api', () => ({ getGroups: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: apiMocks }))

describe('channel base API paths', () => {
  beforeEach(() => {
    apiMocks.get.mockReset()
    apiMocks.post.mockReset()
  })

  test('uses the registered trailing-slash path when listing channels', async () => {
    apiMocks.get.mockResolvedValue({ data: { success: true } })

    await getChannels({ p: 2, page_size: 20 })

    expect(apiMocks.get).toHaveBeenCalledWith('/api/channel/', {
      params: { p: 2, page_size: 20 },
    })
  })

  test('uses the registered trailing-slash path when creating a channel', async () => {
    apiMocks.post.mockResolvedValue({ data: { success: true } })
    const payload: AddChannelRequest = {
      mode: 'single',
      channel: { name: 'test' },
    }

    await createChannel(payload)

    expect(apiMocks.post).toHaveBeenCalledWith(
      '/api/channel/',
      payload,
      expect.objectContaining({
        skipBusinessError: true,
        skipErrorHandler: true,
      })
    )
  })
})
