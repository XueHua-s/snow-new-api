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
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { expect, it, vi } from 'vitest'

import { getChannelKey } from '../../api'
import type { ChannelFormValues } from '../../lib'
import { useChannelCredentialActions } from './use-channel-credential-actions'

vi.mock('../../api', () => ({ getChannelKey: vi.fn() }))

it.each(['close', 'switch'] as const)(
  'does not reveal a late credential response after editor %s',
  async (change) => {
    let resolve!: (value: Awaited<ReturnType<typeof getChannelKey>>) => void
    vi.mocked(getChannelKey).mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const queryClient = new QueryClient()
    const { result, rerender } = renderHook(
      ({ open, channelId }) => {
        const form = useForm<ChannelFormValues>()
        return useChannelCredentialActions({
          open,
          channelId,
          form,
          queryClient,
          withVerification: async (action) => action('verified-proof'),
          startVerification: async () => false,
        })
      },
      { initialProps: { open: true, channelId: 1 } }
    )
    let reveal!: Promise<void>
    act(() => {
      reveal = result.current.handleRevealKey()
    })
    expect(result.current.isChannelKeyLoading).toBe(true)
    rerender({
      open: change !== 'close',
      channelId: change === 'switch' ? 2 : 1,
    })
    await act(async () => {
      resolve({
        success: true,
        message: '',
        data: { key: 'old-channel-secret' },
      })
      await reveal
    })
    expect(getChannelKey).toHaveBeenCalledWith(1, 'verified-proof')
    expect(result.current.channelKey).toBeNull()
    expect(result.current.isChannelKeyLoading).toBe(false)
  }
)
