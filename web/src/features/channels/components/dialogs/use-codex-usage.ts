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
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

import {
  getCodexResetCredits,
  resetCodexUsage,
  type CodexResetCreditsResponse,
} from '../../oauth-api'
import {
  type CodexUsageDialogData,
  type CodexUsagePayload,
  type CodexResetCreditsPayload,
  getAccountTypeBadge,
  resolveRateLimitWindows,
} from './codex-usage-data'

export type CodexUsageDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  channelName?: string
  channelId?: number
  channelDisplayName?: string
  channelDisplayId?: string
  response: CodexUsageDialogData | null
  onRefresh?: () => void | Promise<void>
  isRefreshing?: boolean
}

export function useCodexUsage({
  onOpenChange,
  channelName,
  channelId,
  channelDisplayName,
  channelDisplayId,
  response,
  onRefresh,
}: CodexUsageDialogProps) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const [showRawJson, setShowRawJson] = useState(false)
  const [showResetCredits, setShowResetCredits] = useState(false)
  const [resetCreditsResponse, setResetCreditsResponse] =
    useState<CodexResetCreditsResponse | null>(null)
  const [isLoadingResetCredits, setIsLoadingResetCredits] = useState(false)
  const [resetCreditsError, setResetCreditsError] = useState('')
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [resetActionError, setResetActionError] = useState('')
  const [resetActionMessage, setResetActionMessage] = useState('')

  const payload: CodexUsagePayload | null = useMemo(() => {
    const raw = response?.data
    if (!raw || typeof raw !== 'object') {
      return null
    }
    return raw as CodexUsagePayload
  }, [response?.data])

  const resetCreditsPayload: CodexResetCreditsPayload | null = useMemo(() => {
    const raw = resetCreditsResponse?.data
    if (!raw || typeof raw !== 'object') {
      return null
    }
    return raw as CodexResetCreditsPayload
  }, [resetCreditsResponse?.data])

  const rateLimit = payload?.rate_limit
  const accountType = payload?.plan_type ?? rateLimit?.plan_type
  const accountBadge = getAccountTypeBadge(accountType, t)
  const additionalRateLimits = (payload?.additional_rate_limits ?? []).filter(
    (item) => item && Object.keys(item).length > 0
  )
  const resetCredits =
    resetCreditsPayload?.available_count ??
    payload?.rate_limit_reset_credits?.available_count
  const resetCreditsText = Number.isFinite(Number(resetCredits))
    ? String(resetCredits)
    : '-'
  const canResetCodexUsage = Number(resetCredits) > 0
  const channelLabelName = channelDisplayName ?? channelName ?? '-'
  let channelLabelId = ''
  if (channelDisplayId != null) {
    channelLabelId = ` (#${channelDisplayId})`
  } else if (channelId) {
    channelLabelId = ` (#${channelId})`
  }
  const channelLabel = `${channelLabelName}${channelLabelId}`
  const { fiveHourWindow, weeklyWindow } = resolveRateLimitWindows(payload)

  const errorMessage =
    response?.success === false
      ? response?.message?.trim() || t('Failed to fetch usage')
      : ''

  const loadResetCredits = useCallback(
    async (force = false) => {
      if (!channelId) {
        setResetCreditsError(t('Channel ID is required'))
        return
      }
      if (isLoadingResetCredits || (!force && resetCreditsResponse)) {
        return
      }

      setIsLoadingResetCredits(true)
      setResetCreditsError('')
      try {
        const res = await getCodexResetCredits(channelId)
        if (!res.success) {
          throw new Error(
            res.message || t('Failed to fetch reset credit details')
          )
        }
        setResetCreditsResponse(res)
      } catch (error) {
        setResetCreditsError(
          error instanceof Error
            ? error.message
            : t('Failed to fetch reset credit details')
        )
      } finally {
        setIsLoadingResetCredits(false)
      }
    },
    [channelId, isLoadingResetCredits, resetCreditsResponse, t]
  )

  const handleResetCreditsOpenChange = (nextOpen: boolean) => {
    setShowResetCredits(nextOpen)
    if (nextOpen) {
      void loadResetCredits(false)
    }
  }

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setShowRawJson(false)
      setShowResetCredits(false)
      setResetCreditsResponse(null)
      setResetCreditsError('')
      setIsLoadingResetCredits(false)
      setResetConfirmOpen(false)
      setIsResetting(false)
      setResetActionError('')
      setResetActionMessage('')
    }
    onOpenChange(nextOpen)
  }

  const handleConfirmReset = async () => {
    if (!channelId || isResetting || !canResetCodexUsage) {
      return
    }

    setIsResetting(true)
    setResetActionError('')
    setResetActionMessage('')
    try {
      const res = await resetCodexUsage(channelId)
      if (!res.success) {
        throw new Error(res.message || t('Failed to reset usage'))
      }

      const resetPayload = res.data as
        | { windows_reset?: number; code?: string }
        | undefined
      const windowsReset = Number(resetPayload?.windows_reset)
      setResetActionMessage(
        Number.isFinite(windowsReset)
          ? `${t('Reset completed. Latest usage has been refreshed.')} ${t(
              'Affected windows:'
            )} ${windowsReset}`
          : t('Reset completed. Latest usage has been refreshed.')
      )
      setResetConfirmOpen(false)
      await Promise.resolve(onRefresh?.())
      await loadResetCredits(true)
    } catch (error) {
      setResetActionError(
        error instanceof Error ? error.message : t('Failed to reset usage')
      )
    } finally {
      setIsResetting(false)
    }
  }

  const rawJsonText = useMemo(() => {
    if (!response) {
      return ''
    }
    try {
      return JSON.stringify(
        {
          success: response.success,
          message: response.message,
          upstream_status: response.upstream_status,
          data: response.data,
        },
        null,
        2
      )
    } catch {
      return String(response?.data ?? '')
    }
  }, [response])

  return {
    copiedText,
    copyToClipboard,
    showRawJson,
    setShowRawJson,
    showResetCredits,
    resetCreditsResponse,
    isLoadingResetCredits,
    resetCreditsError,
    resetConfirmOpen,
    setResetConfirmOpen,
    isResetting,
    resetActionError,
    setResetActionError,
    resetActionMessage,
    setResetActionMessage,
    payload,
    resetCreditsPayload,
    rateLimit,
    accountBadge,
    additionalRateLimits,
    resetCredits,
    resetCreditsText,
    canResetCodexUsage,
    channelLabel,
    fiveHourWindow,
    weeklyWindow,
    errorMessage,
    loadResetCredits,
    handleResetCreditsOpenChange,
    handleDialogOpenChange,
    handleConfirmReset,
    rawJsonText,
  }
}
