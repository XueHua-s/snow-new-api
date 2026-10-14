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
  renderHook,
  waitFor,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useSecureVerification } from '@/features/auth/secure-verification'
import { api } from '@/lib/api'

import { updateChannel } from '../api'
import { CodexOAuthDialog } from '../components/dialogs/codex-oauth-dialog'
import { deleteMultiKey, deleteDisabledMultiKeys } from '../multi-key-api'
import {
  startCodexOAuth,
  completeCodexOAuth,
  refreshCodexCredential,
  startClaudeOAuth,
} from '../oauth-api'

const originalAdapter = api.defaults.adapter
let requests: InternalAxiosRequestConfig[]
let rejectProof = false
let failPasskeyStatus = false
let verifyResponse: Promise<void> | undefined
beforeEach(() => {
  requests = []
  rejectProof = false
  failPasskeyStatus = false
  verifyResponse = undefined
  api.defaults.adapter = async (config) => {
    requests.push(config)
    let data: unknown = { success: true }
    if (config.url === '/api/user/2fa/status') {
      data = { success: true, data: { enabled: true } }
    }
    if (config.url === '/api/user/passkey') {
      if (failPasskeyStatus) {
        throw new AxiosError(
          'Passkey status unavailable',
          'ERR_NETWORK',
          config
        )
      }
      data = { success: true, data: { enabled: false } }
    }
    if (config.url === '/api/verify') {
      await verifyResponse
      data = {
        success: true,
        data: {
          proof_token: 'synthetic-proof',
          scope: 'channel.codex.credentials.write',
          method: '2fa',
          expires_at: 9999999999,
        },
      }
    }
    if (config.url?.endsWith('/oauth/start')) {
      data = {
        success: true,
        data: {
          authorize_url: 'https://auth.example.test/authorize',
          flow_token: 'synthetic-flow',
        },
      }
    }
    if (config.url?.endsWith('/oauth/complete')) {
      data = { success: true, data: { key: 'synthetic-key', channel_id: 12 } }
    }
    if (rejectProof && config.url?.includes('/codex/refresh')) {
      throw new AxiosError(
        'Proof expired',
        'ERR_BAD_REQUEST',
        config,
        undefined,
        {
          config,
          status: 403,
          statusText: 'Forbidden',
          headers: {},
          data: { success: false, code: 'SECURITY_PROOF_EXPIRED' },
        }
      )
    }
    return { config, status: 200, statusText: 'OK', headers: {}, data }
  }
  vi.spyOn(window, 'open').mockReturnValue(null)
})
afterEach(() => {
  api.defaults.adapter = originalAdapter
})
const scope = 'channel.codex.credentials.write' as const

describe('Codex credential proof requests', () => {
  test('sends a proof only to the explicitly selected channel operation', async () => {
    await startCodexOAuth(12, 'start-proof')
    await completeCodexOAuth('callback', 'flow', 12, 'complete-proof')
    await refreshCodexCredential(12, 'refresh-proof')
    await updateChannel(12, { key: 'synthetic-key' }, 'write-proof')
    await deleteMultiKey(12, 0, 'delete-proof')
    await deleteDisabledMultiKeys(12, 'bulk-proof')
    expect(
      requests.map((r) => [r.url, r.headers.get('X-Security-Proof')])
    ).toEqual([
      ['/api/channel/12/codex/oauth/start', 'start-proof'],
      ['/api/channel/12/codex/oauth/complete', 'complete-proof'],
      ['/api/channel/12/codex/refresh', 'refresh-proof'],
      ['/api/channel/', 'write-proof'],
      ['/api/channel/multi_key/manage', 'delete-proof'],
      ['/api/channel/multi_key/manage', 'bulk-proof'],
    ])
    await startCodexOAuth()
    await startClaudeOAuth()
    expect(
      requests.slice(-2).map((r) => [r.url, r.headers.get('X-Security-Proof')])
    ).toEqual([
      ['/api/channel/codex/oauth/start', undefined],
      ['/api/channel/claude/oauth/start', undefined],
    ])
  })
  test('does not send a protected operation when verification is cancelled', async () => {
    const { result } = renderHook(() => useSecureVerification())
    await act(async () => {
      await result.current.startVerification(
        (p) => refreshCodexCredential(12, p),
        { scope }
      )
    })
    expect(result.current.open).toBe(true)
    act(() => result.current.cancel())
    expect(requests.some((r) => r.url?.includes('/codex/refresh'))).toBe(false)
    expect(result.current.open).toBe(false)
  })
  test('discards a proof returned after cancellation instead of executing the mutation', async () => {
    let release!: () => void
    verifyResponse = new Promise((resolve) => {
      release = resolve
    })
    const { result } = renderHook(() => useSecureVerification())
    await act(async () => {
      await result.current.startVerification(
        (p) => refreshCodexCredential(12, p),
        { scope }
      )
    })
    let execution!: Promise<unknown>
    act(() => {
      execution = result.current.executeVerification('2fa', '123456')
    })
    await waitFor(() =>
      expect(requests.some((r) => r.url === '/api/verify')).toBe(true)
    )
    act(() => result.current.cancel())
    await act(async () => {
      release()
      await execution
    })
    expect(requests.some((r) => r.url?.includes('/codex/refresh'))).toBe(false)
  })
  test.each(['unmount', 'replace'] as const)(
    'does not execute the old mutation after %s while verification is pending',
    async (action) => {
      let release!: () => void
      verifyResponse = new Promise((resolve) => {
        release = resolve
      })
      const oldMutation = vi.fn()
      const nextMutation = vi.fn()
      const { result, unmount } = renderHook(() => useSecureVerification())
      await act(async () => {
        await result.current.startVerification(oldMutation, { scope })
      })
      let execution!: Promise<unknown>
      act(() => {
        execution = result.current.executeVerification('2fa', '123456')
      })
      await waitFor(() =>
        expect(requests.some((r) => r.url === '/api/verify')).toBe(true)
      )
      if (action === 'unmount') unmount()
      else {
        await act(async () => {
          await result.current.startVerification(nextMutation, { scope })
        })
      }
      await act(async () => {
        release()
        await execution
      })
      expect(oldMutation).not.toHaveBeenCalled()
      expect(nextMutation).not.toHaveBeenCalled()
      if (action === 'replace') {
        await act(async () => {
          await result.current.executeVerification('2fa', '654321')
        })
        expect(nextMutation).toHaveBeenCalledWith('synthetic-proof')
      }
    }
  )
  test('preserves a successful non-Codex sensitive action and its scope', async () => {
    const action = vi.fn().mockResolvedValue('saved')
    const { result } = renderHook(() => useSecureVerification())
    await act(async () => {
      await result.current.startVerification(action, {
        scope: 'passkey.register',
      })
    })
    await act(async () => {
      await result.current.executeVerification('2fa', '123456')
    })
    expect(action).toHaveBeenCalledWith('synthetic-proof')
    expect(
      JSON.parse(requests.find((r) => r.url === '/api/verify')?.data)
    ).toMatchObject({ scope: 'passkey.register' })
    expect(result.current.open).toBe(false)
  })
  test('keeps an expired proof challenge open and obtains a new proof on explicit retry', async () => {
    rejectProof = true
    const success = vi.fn()
    const { result } = renderHook(() =>
      useSecureVerification({ onSuccess: success })
    )
    await act(async () => {
      await result.current.startVerification(
        (p) => refreshCodexCredential(12, p),
        { scope }
      )
    })
    await act(async () => {
      await expect(
        result.current.executeVerification('2fa', '123456')
      ).rejects.toThrow('Proof expired')
    })
    expect(result.current.open).toBe(true)
    expect(success).not.toHaveBeenCalled()
    rejectProof = false
    await act(async () => {
      await result.current.executeVerification('2fa', '654321')
    })
    expect(requests.filter((r) => r.url === '/api/verify')).toHaveLength(2)
    expect(success).toHaveBeenCalledOnce()
    expect(result.current.open).toBe(false)
  })
  test('existing-channel OAuth cancellation preserves the callback without starting OAuth', async () => {
    const user = userEvent.setup()
    const onKey = vi.fn()
    render(
      <CodexOAuthDialog
        open
        channelId={12}
        onOpenChange={() => {}}
        onKeyGenerated={onKey}
      />
    )
    const callback = screen.getByPlaceholderText(
      'Paste the full callback URL (includes code & state)'
    )
    await user.type(callback, 'http://localhost/callback?code=synthetic')
    await user.click(
      screen.getByRole('button', { name: 'Open authorization page' })
    )
    const verification = await screen.findByRole('dialog', {
      name: 'Additional verification required',
    })
    await user.click(
      within(verification).getByRole('button', { name: 'Cancel' })
    )
    expect(callback).toHaveValue('http://localhost/callback?code=synthetic')
    expect(requests.some((r) => r.url?.includes('/codex/oauth/'))).toBe(false)
    expect(onKey).not.toHaveBeenCalled()
  })
  test.each([false, true])(
    'existing-channel OAuth obtains scoped proofs even with passkey status unavailable=%s',
    async (unavailable) => {
      failPasskeyStatus = unavailable
      const user = userEvent.setup()
      const saved = vi.fn()
      render(
        <CodexOAuthDialog
          open
          channelId={12}
          onOpenChange={() => {}}
          onKeyGenerated={saved}
        />
      )
      await user.click(
        screen.getByRole('button', { name: 'Open authorization page' })
      )
      let dialog = await screen.findByRole('dialog', {
        name: 'Additional verification required',
      })
      await user.type(
        within(dialog).getByPlaceholderText('Enter verification code'),
        '123456'
      )
      await user.click(within(dialog).getByRole('button', { name: 'Verify' }))
      await waitFor(() => expect(window.open).toHaveBeenCalled())
      await user.type(
        screen.getByPlaceholderText(
          'Paste the full callback URL (includes code & state)'
        ),
        'http://localhost/callback?code=synthetic'
      )
      await user.click(
        screen.getByRole('button', { name: 'Authorize and save' })
      )
      dialog = await screen.findByRole('dialog', {
        name: 'Additional verification required',
      })
      await user.type(
        within(dialog).getByPlaceholderText('Enter verification code'),
        '654321'
      )
      await user.click(within(dialog).getByRole('button', { name: 'Verify' }))
      await waitFor(() => expect(saved).toHaveBeenCalledWith(''))
      expect(requests.filter((r) => r.url === '/api/verify')).toHaveLength(2)
      const operations = requests.filter((r) =>
        r.url?.includes('/codex/oauth/')
      )
      expect(operations.map((r) => r.url)).toEqual([
        '/api/channel/12/codex/oauth/start',
        '/api/channel/12/codex/oauth/complete',
      ])
      expect(
        operations.every(
          (r) => r.headers.get('X-Security-Proof') === 'synthetic-proof'
        )
      ).toBe(true)
      expect(JSON.parse(operations[1].data)).toEqual({
        input: 'http://localhost/callback?code=synthetic',
        flow_token: 'synthetic-flow',
      })
    }
  )
  test('new-channel OAuth uses the generic path without a security-proof prompt', async () => {
    const user = userEvent.setup()
    render(
      <CodexOAuthDialog
        open
        onOpenChange={() => {}}
        onKeyGenerated={() => {}}
      />
    )
    await user.click(
      screen.getByRole('button', { name: 'Open authorization page' })
    )
    await waitFor(() =>
      expect(
        requests.some((r) => r.url === '/api/channel/codex/oauth/start')
      ).toBe(true)
    )
    expect(
      screen.queryByRole('dialog', { name: 'Additional verification required' })
    ).not.toBeInTheDocument()
  })
})
