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
import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { api } from '@/lib/api'
import { formatTimestampToDate } from '@/lib/format'

import {
  getCurrentLogCleanupTask,
  getSystemTask,
  startLogCleanupTask,
} from '../api'
import { useUpdateOption } from '../hooks/use-update-option'
import type { LogCleanupTask } from '../types'
import { formatBytes } from './log-storage-format'

const logSettingsSchema = z.object({
  LogConsumeEnabled: z.boolean(),
})

type LogSettingsFormValues = z.infer<typeof logSettingsSchema>

export type LogSettingsSectionProps = {
  defaultEnabled: boolean
}

type ServerLogInfo = {
  enabled: boolean
  log_dir: string
  file_count: number
  total_size: number
  oldest_time?: string
  newest_time?: string
}

const HOURS_IN_DAY = 24

const getDateHoursAgo = (hours: number) => {
  const date = new Date()
  date.setHours(date.getHours() - hours)
  return date
}

const getDateDaysAgo = (days: number) => getDateHoursAgo(days * HOURS_IN_DAY)

export const quickSelectOptions = [
  {
    label: '24 hours ago',
    getValue: () => getDateHoursAgo(24),
  },
  {
    label: '7 days ago',
    getValue: () => getDateDaysAgo(7),
  },
  {
    label: '30 days ago',
    getValue: () => getDateDaysAgo(30),
  },
]

function isActiveLogCleanupTask(task: LogCleanupTask | null) {
  return task?.status === 'pending' || task?.status === 'running'
}

export function useLogSettings({ defaultEnabled }: LogSettingsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<LogSettingsFormValues>({
    resolver: zodResolver(logSettingsSchema),
    defaultValues: {
      LogConsumeEnabled: defaultEnabled,
    },
  })

  const [purgeDate, setPurgeDate] = useState<Date | undefined>(() =>
    getDateDaysAgo(30)
  )
  const [isStartingLogCleanup, setIsStartingLogCleanup] = useState(false)
  const [logCleanupTask, setLogCleanupTask] = useState<LogCleanupTask | null>(
    null
  )
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [serverLogInfo, setServerLogInfo] = useState<ServerLogInfo | null>(null)
  const [serverLogCleanupMode, setServerLogCleanupMode] = useState('by_count')
  const [serverLogCleanupValue, setServerLogCleanupValue] = useState(10)
  const [serverLogCleanupLoading, setServerLogCleanupLoading] = useState(false)

  const fetchServerLogInfo = useCallback(async () => {
    try {
      const res = await api.get('/api/performance/logs')
      if (res.data.success) setServerLogInfo(res.data.data)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    form.reset({ LogConsumeEnabled: defaultEnabled })
  }, [defaultEnabled, form])

  useEffect(() => {
    fetchServerLogInfo()
  }, [fetchServerLogInfo])

  useEffect(() => {
    let cancelled = false

    async function fetchCurrentLogCleanupTask() {
      try {
        const res = await getCurrentLogCleanupTask()
        if (!cancelled && res.success && res.data) {
          setLogCleanupTask(res.data)
        }
      } catch {
        /* ignore */
      }
    }

    fetchCurrentLogCleanupTask()

    return () => {
      cancelled = true
    }
  }, [])

  const purgeTimestamp = useMemo(() => {
    if (!purgeDate) return null
    return Math.floor(purgeDate.getTime() / 1000)
  }, [purgeDate])

  const formattedPurgeDate = useMemo(() => {
    if (!purgeDate) return ''
    return formatTimestampToDate(purgeDate.getTime(), 'milliseconds')
  }, [purgeDate])

  const logCleanupActive = isActiveLogCleanupTask(logCleanupTask)
  const logCleanupState = logCleanupTask?.state
  const logCleanupProgress = Math.min(
    100,
    Math.max(0, logCleanupState?.progress ?? 0)
  )
  const logCleanupProcessed = logCleanupState?.processed ?? 0
  const logCleanupTotal = logCleanupState?.total ?? 0
  const logCleanupTaskId = logCleanupTask?.task_id

  useEffect(() => {
    if (!logCleanupTaskId || !logCleanupActive) return

    let cancelled = false
    const interval = window.setInterval(async () => {
      try {
        const res = await getSystemTask(logCleanupTaskId)
        if (cancelled || !res.success || !res.data) return

        setLogCleanupTask(res.data)
        if (!isActiveLogCleanupTask(res.data)) {
          if (res.data.status === 'succeeded') {
            const count =
              res.data.result?.deleted_count ?? res.data.state?.processed ?? 0
            toast.success(
              count > 0
                ? t('{{count}} log entries removed.', { count })
                : t('No log entries matched the selected time.')
            )
          } else if (res.data.status === 'failed') {
            toast.error(res.data.error || t('Failed to clean logs'))
          }
        }
      } catch {
        /* keep polling */
      }
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [logCleanupActive, logCleanupTaskId, t])

  const onSubmit = async (values: LogSettingsFormValues) => {
    if (values.LogConsumeEnabled === defaultEnabled) return
    await updateOption.mutateAsync({
      key: 'LogConsumeEnabled',
      value: values.LogConsumeEnabled,
    })
  }

  const handleRequestCleanLogs = () => {
    if (!purgeTimestamp) {
      toast.error(t('Select a timestamp before clearing logs.'))
      return
    }

    setShowConfirmDialog(true)
  }

  const handleCleanLogs = async () => {
    if (!purgeTimestamp) {
      toast.error(t('Select a timestamp before clearing logs.'))
      return
    }

    setIsStartingLogCleanup(true)
    try {
      const res = await startLogCleanupTask(purgeTimestamp)
      if (!res.success) {
        throw new Error(res.message || t('Failed to clean logs'))
      }
      if (!res.data) {
        throw new Error(t('Failed to clean logs'))
      }
      setLogCleanupTask(res.data)
      setShowConfirmDialog(false)
      toast.success(t('Log cleanup task started.'))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Failed to clean logs')
      toast.error(message)
    } finally {
      setIsStartingLogCleanup(false)
    }
  }

  const cleanupServerLogFiles = async () => {
    if (
      !serverLogCleanupValue ||
      Number.isNaN(serverLogCleanupValue) ||
      serverLogCleanupValue < 1
    ) {
      toast.error(t('Please enter a valid number'))
      return
    }

    setServerLogCleanupLoading(true)
    try {
      const res = await api.delete(
        `/api/performance/logs?mode=${serverLogCleanupMode}&value=${serverLogCleanupValue}`
      )
      if (res.data.success) {
        const { deleted_count, freed_bytes } = res.data.data
        toast.success(
          t('Cleaned up {{count}} log files, freed {{size}}', {
            count: deleted_count,
            size: formatBytes(freed_bytes),
          })
        )
      } else {
        toast.error(res.data.message || t('Cleanup failed'))
      }
      fetchServerLogInfo()
    } catch {
      toast.error(t('Cleanup failed'))
    } finally {
      setServerLogCleanupLoading(false)
    }
  }

  return {
    updateOption,
    form,
    purgeDate,
    setPurgeDate,
    isStartingLogCleanup,
    logCleanupTask,
    showConfirmDialog,
    setShowConfirmDialog,
    serverLogInfo,
    serverLogCleanupMode,
    setServerLogCleanupMode,
    serverLogCleanupValue,
    setServerLogCleanupValue,
    serverLogCleanupLoading,
    formattedPurgeDate,
    logCleanupActive,
    logCleanupProgress,
    logCleanupProcessed,
    logCleanupTotal,
    onSubmit,
    handleRequestCleanLogs,
    handleCleanLogs,
    cleanupServerLogFiles,
  }
}
