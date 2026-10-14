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
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { checkVerificationMethods } from '../api'
import { SecureVerificationDialog } from '../components/secure-verification-dialog'
import { useSecureVerification } from '../hooks/use-secure-verification'

const originalAdapter = api.defaults.adapter
let twoFA: unknown
let passkey: unknown
let failedPath: string | undefined

beforeEach(() => {
  twoFA = { success: true, data: { enabled: true } }
  passkey = { success: true, data: { enabled: true } }
  failedPath = undefined
  api.defaults.adapter = async (config) => {
    if (failedPath === 'all' || config.url === failedPath) {
      throw new AxiosError(
        'Status temporarily unavailable',
        'ERR_NETWORK',
        config
      )
    }
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: config.url === '/api/user/2fa/status' ? twoFA : passkey,
    }
  }
})
afterEach(() => {
  api.defaults.adapter = originalAdapter
})

test('a failed passkey status query does not hide enabled 2FA', async () => {
  failedPath = '/api/user/passkey'
  expect(await checkVerificationMethods()).toMatchObject({
    has2FA: true,
    hasPasskey: null,
  })
})

test('a failed 2FA status query does not hide an enrolled passkey', async () => {
  failedPath = '/api/user/2fa/status'
  expect(await checkVerificationMethods()).toMatchObject({
    has2FA: null,
    hasPasskey: true,
  })
})

test.each([
  { success: false, message: 'Temporarily unavailable' },
  { success: true },
  { success: true, data: { enabled: 'false' } },
])(
  'an invalid status response stays unknown instead of becoming disabled',
  async (response) => {
    twoFA = response
    passkey = { success: true, data: { enabled: false } }
    expect(await checkVerificationMethods()).toMatchObject({
      has2FA: null,
      hasPasskey: false,
    })
  }
)

test('confirmed absent security methods remain disabled', async () => {
  twoFA = { success: true, data: { enabled: false } }
  passkey = { success: true, data: { enabled: false } }
  expect(await checkVerificationMethods()).toMatchObject({
    has2FA: false,
    hasPasskey: false,
  })
})

test('reauthorization opens 2FA verification when passkey status fails', async () => {
  failedPath = '/api/user/passkey'
  const mutation = vi.fn()
  const { result } = renderHook(() => useSecureVerification())
  await act(async () => {
    expect(
      await result.current.startVerification(mutation, {
        scope: 'channel.codex.credentials.write',
      })
    ).toBe(true)
  })
  expect(result.current.open).toBe(true)
  expect(result.current.currentMethod).toBe('2fa')
  expect(mutation).not.toHaveBeenCalled()
})

test('unavailable status reports a load failure and supports retry without changing account settings', async () => {
  failedPath = 'all'
  const toastError = vi.spyOn(toast, 'error')
  const mutation = vi.fn()
  const { result } = renderHook(() => useSecureVerification())
  await act(async () => {
    expect(
      await result.current.startVerification(mutation, {
        scope: 'channel.codex.credentials.write',
      })
    ).toBe(false)
  })
  expect(result.current.open).toBe(false)
  expect(toastError).toHaveBeenCalledWith('Failed to start verification')
  expect(toastError).not.toHaveBeenCalledWith(
    'Please enable Two-factor Authentication or Passkey before proceeding'
  )
  expect(mutation).not.toHaveBeenCalled()
  failedPath = undefined
  await act(async () => {
    expect(
      await result.current.startVerification(mutation, {
        scope: 'channel.codex.credentials.write',
      })
    ).toBe(true)
  })
  expect(result.current.open).toBe(true)
  expect(mutation).not.toHaveBeenCalled()
})

test('missing site factors show setup guidance without invoking the protected action', async () => {
  twoFA = { success: true, data: { enabled: false } }
  passkey = { success: true, data: { enabled: false } }
  const mutation = vi.fn()
  const { result } = renderHook(() => useSecureVerification())
  await act(async () => {
    expect(
      await result.current.startVerification(mutation, {
        scope: 'channel.codex.credentials.write',
      })
    ).toBe(true)
  })
  const onVerify = vi.fn()
  render(
    <SecureVerificationDialog
      open={result.current.open}
      onOpenChange={vi.fn()}
      methods={result.current.methods}
      state={result.current.state}
      onVerify={onVerify}
      onCancel={result.current.cancel}
      onCodeChange={result.current.setCode}
      onMethodChange={result.current.switchMethod}
    />
  )
  expect(screen.getByRole('dialog')).toHaveAccessibleName(
    'Set up verification for this site'
  )
  expect(screen.getByText(/Security settings on OpenAI, ChatGPT/)).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'Open security settings' })
  ).toHaveAttribute('href', '/profile')
  expect(
    screen.getByRole('link', { name: 'Open security settings' })
  ).toHaveAttribute('target', '_blank')
  expect(
    screen.queryByRole('button', { name: 'Verify' })
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(result.current.open).toBe(false)
  expect(onVerify).not.toHaveBeenCalled()
  expect(mutation).not.toHaveBeenCalled()

  twoFA = { success: true, data: { enabled: true } }
  await act(async () => {
    await result.current.startVerification(mutation, {
      scope: 'channel.codex.credentials.write',
    })
  })
  expect(result.current.currentMethod).toBe('2fa')
  expect(mutation).not.toHaveBeenCalled()
})

test('an enrolled passkey on an unsupported device is not described as missing enrollment', () => {
  render(
    <SecureVerificationDialog
      open
      onOpenChange={vi.fn()}
      methods={{ has2FA: false, hasPasskey: true, passkeySupported: false }}
      state={{ method: null, loading: false, code: '' }}
      onVerify={vi.fn()}
      onCancel={vi.fn()}
      onCodeChange={vi.fn()}
      onMethodChange={vi.fn()}
    />
  )
  expect(
    screen.getByText('This device does not support Passkey verification.')
  ).toBeVisible()
  expect(
    screen.queryByRole('link', { name: 'Open security settings' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled()
})
