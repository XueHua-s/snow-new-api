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
import { useEffect, useCallback } from 'react'
import type { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  parseChannelConnectionInfo,
  type ChannelConnectionInfo,
} from '@/lib/channel-connection-info'

import type { ChannelFormValues } from '../../lib'

export function useChannelConnectionClipboard({
  form,
  setClipboardConnectionInfo,
  open,
  isEditing,
}: {
  form: ReturnType<typeof useForm<ChannelFormValues>>
  setClipboardConnectionInfo: React.Dispatch<
    React.SetStateAction<ChannelConnectionInfo | null>
  >
  open: boolean
  isEditing: boolean
}) {
  const { t } = useTranslation()
  const applyConnectionInfo = useCallback(
    (connectionInfo: ChannelConnectionInfo) => {
      form.setValue('key', connectionInfo.key, {
        shouldDirty: true,
        shouldValidate: true,
      })
      form.setValue('base_url', connectionInfo.url, {
        shouldDirty: true,
        shouldValidate: true,
      })
      setClipboardConnectionInfo(null)
      toast.success(t('Connection info filled in'))
    },
    [form, t, setClipboardConnectionInfo]
  )

  const pasteConnectionInfoFromClipboard = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      toast.error(t('Unable to read clipboard'))
      return
    }

    try {
      const text = await navigator.clipboard.readText()
      const parsed = parseChannelConnectionInfo(text)
      if (parsed) {
        applyConnectionInfo(parsed)
        return
      }
      toast.info(t('No connection info found in clipboard'))
    } catch {
      toast.error(t('Unable to read clipboard'))
    }
  }, [applyConnectionInfo, t])

  useEffect(() => {
    if (!open || isEditing) {
      setClipboardConnectionInfo(null)
      return
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      return
    }

    let cancelled = false
    void navigator.clipboard
      .readText()
      .then((text) => {
        if (cancelled) return
        setClipboardConnectionInfo(parseChannelConnectionInfo(text))
      })
      .catch(() => {
        /* Clipboard detection is best-effort on drawer open. */
      })

    return () => {
      cancelled = true
    }
  }, [isEditing, open, setClipboardConnectionInfo])
  return { applyConnectionInfo, pasteConnectionInfoFromClipboard }
}
