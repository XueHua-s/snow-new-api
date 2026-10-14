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
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useChannelSaveConfirmation } from './use-channel-save-confirmation'

describe('channel save confirmations', () => {
  it.each(['close', 'switch', 'unmount'] as const)(
    'cancels both pending decisions on %s',
    async (action) => {
      const { result, rerender, unmount } = renderHook(
        ({ open, channelId }) => useChannelSaveConfirmation(open, channelId),
        { initialProps: { open: true, channelId: 1 } }
      )
      let missing!: Promise<string>
      let risk!: Promise<boolean>
      act(() => {
        missing = result.current.confirmMissingModelMappings(['model-a'])
        risk = result.current.confirmStatusCodeRisk(['500 -> 200'])
      })
      expect(result.current.missingModelsDialogOpen).toBe(true)
      expect(result.current.statusCodeRiskOpen).toBe(true)
      if (action === 'unmount') unmount()
      else
        {rerender({
          open: action !== 'close',
          channelId: action === 'switch' ? 2 : 1,
        })}
      await expect(missing).resolves.toBe('cancel')
      await expect(risk).resolves.toBe(false)
      if (action !== 'unmount') {
        expect(result.current.missingModelsDialogOpen).toBe(false)
        expect(result.current.statusCodeRiskOpen).toBe(false)
      }
    }
  )

  it('settles a dismissed mapping prompt without approving a save', async () => {
    const { result } = renderHook(() => useChannelSaveConfirmation(true, 1))
    let decision!: Promise<string>
    act(() => {
      decision = result.current.confirmMissingModelMappings(['model-a'])
    })
    act(() => {
      result.current.setMissingModelsDialogOpen(false)
    })
    await expect(decision).resolves.toBe('cancel')
    expect(result.current.missingModelsList).toEqual([])
  })

  it('cancels a replaced prompt and accepts only the current decision', async () => {
    const { result } = renderHook(() => useChannelSaveConfirmation(true, 1))
    let replaced!: Promise<string>
    let current!: Promise<string>
    act(() => {
      replaced = result.current.confirmMissingModelMappings(['old'])
      current = result.current.confirmMissingModelMappings(['new'])
    })
    await expect(replaced).resolves.toBe('cancel')
    expect(result.current.missingModelsList).toEqual(['new'])
    act(() => {
      result.current.handleMissingModelsAction('add')
    })
    await expect(current).resolves.toBe('add')
    expect(result.current.missingModelsDialogOpen).toBe(false)
  })
})
