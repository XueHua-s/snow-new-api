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
import { api } from '@/lib/api'

import { channelActionConfig } from './channel-request-config'

export type CodexUsageResponse = {
  success: boolean
  message?: string
  upstream_status?: number
  data?: Record<string, unknown>
}

export type OAuthStartResponse = {
  success: boolean
  message?: string
  data?: {
    authorize_url?: string
    flow_token?: string
  }
}

export type OAuthCompleteResponse = {
  success: boolean
  message?: string
  data?: {
    key?: string
    channel_id?: number
    account_id?: string
    email?: string
    expires_at?: string
    last_refresh?: string
  }
}

export type ClaudeUsageResponse = CodexUsageResponse

export type CodexResetCreditsResponse = CodexUsageResponse

export type CodexUsageResetResponse = CodexUsageResponse

export type CodexCredentialRefreshResponse = {
  success: boolean
  message?: string
  data?: {
    expires_at?: string
    last_refresh?: string
    account_id?: string
    email?: string
    channel_id?: number
    channel_type?: number
    channel_name?: string
  }
}

// ============================================================================
// Codex Channel Operations
// ============================================================================

export async function startCodexOAuth(
  channelId?: number | null,
  proofToken?: string
): Promise<OAuthStartResponse> {
  const res = await api.post(
    channelId
      ? `/api/channel/${channelId}/codex/oauth/start`
      : '/api/channel/codex/oauth/start',
    {},
    channelActionConfig({
      headers: proofToken ? { 'X-Security-Proof': proofToken } : undefined,
    })
  )
  return res.data
}

export async function completeCodexOAuth(
  input: string,
  flowToken?: string,
  channelId?: number | null,
  proofToken?: string
): Promise<OAuthCompleteResponse> {
  const res = await api.post(
    channelId
      ? `/api/channel/${channelId}/codex/oauth/complete`
      : '/api/channel/codex/oauth/complete',
    { input, flow_token: flowToken },
    channelActionConfig({
      headers: proofToken ? { 'X-Security-Proof': proofToken } : undefined,
    })
  )
  return res.data
}

export async function refreshCodexCredential(
  channelId: number,
  proofToken?: string
): Promise<CodexCredentialRefreshResponse> {
  const res = await api.post(
    `/api/channel/${channelId}/codex/refresh`,
    {},
    channelActionConfig({
      headers: proofToken ? { 'X-Security-Proof': proofToken } : undefined,
    })
  )
  return res.data
}

export async function getCodexUsage(
  channelId: number
): Promise<CodexUsageResponse> {
  const res = await api.get(
    `/api/channel/${channelId}/codex/usage`,
    channelActionConfig({ disableDuplicate: true })
  )
  return res.data
}

// ============================================================================
// Claude OAuth Channel Operations
// ============================================================================

export async function startClaudeOAuth(): Promise<OAuthStartResponse> {
  const res = await api.post(
    '/api/channel/claude/oauth/start',
    {},
    channelActionConfig()
  )
  return res.data
}

export async function startClaudeOAuthForChannel(
  channelId: number
): Promise<OAuthStartResponse> {
  const res = await api.post(
    `/api/channel/${channelId}/claude/oauth/start`,
    {},
    channelActionConfig()
  )
  return res.data
}

export async function completeClaudeOAuth(
  input: string,
  flowToken?: string
): Promise<OAuthCompleteResponse> {
  const res = await api.post(
    '/api/channel/claude/oauth/complete',
    { input, flow_token: flowToken },
    channelActionConfig()
  )
  return res.data
}

export async function completeClaudeOAuthForChannel(
  channelId: number,
  input: string,
  flowToken?: string
): Promise<OAuthCompleteResponse> {
  const res = await api.post(
    `/api/channel/${channelId}/claude/oauth/complete`,
    { input, flow_token: flowToken },
    channelActionConfig()
  )
  return res.data
}

export async function getClaudeUsage(
  channelId: number
): Promise<ClaudeUsageResponse> {
  const res = await api.get(
    `/api/channel/${channelId}/claude/usage`,
    channelActionConfig({ disableDuplicate: true })
  )
  return res.data
}

export async function getCodexResetCredits(
  channelId: number
): Promise<CodexResetCreditsResponse> {
  const res = await api.get(
    `/api/channel/${channelId}/codex/usage/reset-credits`,
    channelActionConfig({ disableDuplicate: true })
  )
  return res.data
}

export async function resetCodexUsage(
  channelId: number
): Promise<CodexUsageResetResponse> {
  const res = await api.post(
    `/api/channel/${channelId}/codex/usage/reset`,
    {},
    channelActionConfig({ disableDuplicate: true })
  )
  return res.data
}
