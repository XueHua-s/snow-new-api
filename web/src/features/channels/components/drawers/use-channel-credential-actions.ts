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
import type { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { useSecureVerification } from '@/features/auth/secure-verification'

import { getChannelKey } from '../../api'
import {
  channelsQueryKeys,
  type ChannelFormValues,
  deduplicateKeys,
} from '../../lib'
import { refreshCodexCredential } from '../../oauth-api'

/** Owns revealed credentials and prevents late responses leaking into another editor session. */
export function useChannelCredentialActions({
  open,
  form,
  channelId,
  withVerification,
  startVerification,
  queryClient,
}: {
  open: boolean
  form: ReturnType<typeof useForm<ChannelFormValues>>
  channelId: number | null
  withVerification: ReturnType<typeof useSecureVerification>['withVerification']
  startVerification: ReturnType<
    typeof useSecureVerification
  >['startVerification']
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const { t } = useTranslation()
  const [channelKey, setChannelKey] = useState<string | null>(null)
  const [isChannelKeyLoading, setIsChannelKeyLoading] = useState(false)
  const [isCodexCredentialRefreshing, setIsCodexCredentialRefreshing] =
    useState(false)
  const sessionRef = useRef(0)

  useEffect(() => {
    setChannelKey(null)
    setIsChannelKeyLoading(false)
    setIsCodexCredentialRefreshing(false)
    return () => {
      sessionRef.current += 1
    }
  }, [open, channelId])

  const handleDeduplicateKeys = () => {
    const currentKey = form.getValues('key')
    if (!currentKey || currentKey.trim() === '') {
      toast.info(t('Please enter keys first'))
      return
    }

    const result = deduplicateKeys(currentKey)

    if (result.removedCount === 0) {
      toast.info(t('No duplicate keys found'))
    } else {
      form.setValue('key', result.deduplicatedText)
      toast.success(
        t(
          'Removed {{removed}} duplicate key(s). Before: {{before}}, After: {{after}}',
          {
            removed: result.removedCount,
            before: result.beforeCount,
            after: result.afterCount,
          }
        )
      )
    }
  }

  const fetchChannelKey = useCallback(
    async (proofToken?: string) => {
      if (!channelId) {
        throw new Error('Channel is not selected')
      }

      const session = sessionRef.current
      setIsChannelKeyLoading(true)
      try {
        const res = await getChannelKey(channelId, proofToken)
        if (!res.success) {
          throw new Error(res.message || t('Failed to fetch channel key'))
        }

        if (session !== sessionRef.current) return res
        const keyValue = res.data?.key ?? ''
        setChannelKey(keyValue)
        toast.success(t('Channel key unlocked'))
        return res
      } finally {
        if (session === sessionRef.current) setIsChannelKeyLoading(false)
      }
    },
    [channelId, t, setIsChannelKeyLoading, setChannelKey]
  )

  const handleRevealKey = useCallback(async () => {
    if (!channelId) return

    try {
      await withVerification(fetchChannelKey, {
        scope: 'channel.key.read',
        preferredMethod: 'passkey',
        title: t('Verify to view channel key'),
        description: t(
          'Use Passkey or 2FA to confirm your identity before revealing this channel key.'
        ),
      })
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message)
      }
    }
  }, [channelId, withVerification, fetchChannelKey, t])

  const handleRefreshCodexCredential = useCallback(async () => {
    if (!channelId) return
    await startVerification(
      async (proofToken) => {
        const session = sessionRef.current
        setIsCodexCredentialRefreshing(true)
        try {
          const res = await refreshCodexCredential(channelId, proofToken)
          if (!res.success) {
            throw new Error(res.message || t('Failed to refresh credential'))
          }
          toast.success(t('Credential refreshed'))
          queryClient.invalidateQueries({
            queryKey: channelsQueryKeys.detail(channelId),
          })
        } finally {
          if (session === sessionRef.current)
            {setIsCodexCredentialRefreshing(false)}
        }
      },
      { scope: 'channel.codex.credentials.write' }
    )
  }, [channelId, queryClient, t, startVerification])
  return {
    channelKey,
    isChannelKeyLoading,
    isCodexCredentialRefreshing,
    handleDeduplicateKeys,
    handleRevealKey,
    handleRefreshCodexCredential,
  }
}
