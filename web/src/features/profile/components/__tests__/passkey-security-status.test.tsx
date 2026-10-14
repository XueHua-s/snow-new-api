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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { PasskeyCard } from '../passkey-card'

const originalAdapter = api.defaults.adapter
afterEach(() => {
  api.defaults.adapter = originalAdapter
  vi.unstubAllGlobals()
})

test.each([false, true])(
  'unknown 2FA status cannot bypass proof for passkey management (enrolled=%s)',
  async (enrolled) => {
    vi.stubGlobal('PublicKeyCredential', class {})
    const requests: string[] = []
    api.defaults.adapter = async (config) => {
      requests.push(`${config.method} ${config.url}`)
      if (config.url === '/api/user/2fa/status') {
        throw new AxiosError('Status unavailable', 'ERR_NETWORK', config)
      }
      return {
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { success: true, data: { enabled: enrolled } },
      }
    }
    const errorToast = vi.spyOn(toast, 'error')
    const user = userEvent.setup()
    render(<PasskeyCard loading={false} />)
    const trigger = await screen.findByRole('button', {
      name: enrolled ? 'Remove Passkey' : 'Enable Passkey',
    })
    await waitFor(() => expect(trigger).toBeEnabled())
    await user.click(trigger)
    if (enrolled) {
      const confirmation = await screen.findByRole('alertdialog', {
        name: 'Remove Passkey?',
      })
      await user.click(
        within(confirmation).getByRole('button', { name: 'Remove' })
      )
    }
    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith('Failed to start verification')
    )
    expect(requests.every((request) => request.startsWith('get '))).toBe(true)
    expect(
      screen.queryByRole('dialog', { name: 'Security verification' })
    ).not.toBeInTheDocument()
  }
)
