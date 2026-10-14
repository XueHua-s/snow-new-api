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
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getFreshAuthHeaders } from '../../../../lib/auth-session'
import {
  deleteOllamaModel,
  fetchModels as fetchModelsFromEndpoint,
  fetchUpstreamModels,
  updateChannel,
} from '../../api'
import { channelsQueryKeys, parseModelsString } from '../../lib'
import {
  normalizeOllamaModels,
  resolveOllamaBaseUrl,
  type OllamaModel,
  type PullProgress,
} from '../../lib/ollama-utils'
import { useChannels } from '../channels-provider'

const CHANNEL_TYPE_OLLAMA = 4

export function useOllamaModels({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { currentRow } = useChannels()

  const isOllamaChannel = currentRow?.type === CHANNEL_TYPE_OLLAMA
  const channelId = currentRow?.id

  const [isFetching, setIsFetching] = useState(false)
  const [models, setModels] = useState<OllamaModel[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const [pullName, setPullName] = useState('')
  const [isPulling, setIsPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null)
  const pullAbortRef = useRef<AbortController | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const filteredModels = useMemo(() => {
    if (!search.trim()) return models
    const keyword = search.trim().toLowerCase()
    return models.filter((m) => m.id.toLowerCase().includes(keyword))
  }, [models, search])

  const existingModels = useMemo(
    () => parseModelsString(currentRow?.models ?? ''),
    [currentRow?.models]
  )

  useEffect(() => {
    if (!open) {
      setModels([])
      setSelected([])
      setSearch('')
      setPullName('')
      setIsPulling(false)
      setPullProgress(null)
      pullAbortRef.current?.abort()
      pullAbortRef.current = null
      return
    }

    if (open && isOllamaChannel && channelId) {
      void fetchOllamaModels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isOllamaChannel, channelId])

  const fetchOllamaModels = useCallback(async () => {
    if (!channelId) return
    setIsFetching(true)
    try {
      let normalized: OllamaModel[] = []
      let lastErr = ''

      // 1) Prefer live fetch for Ollama if base_url is set (more accurate / supports unsaved changes)
      const baseUrl = resolveOllamaBaseUrl(currentRow ?? null)
      if (isOllamaChannel && baseUrl) {
        try {
          const payloadLive = await fetchModelsFromEndpoint({
            base_url: baseUrl,
            type: CHANNEL_TYPE_OLLAMA,
            key: typeof currentRow?.key === 'string' ? currentRow.key : '',
          })
          if (payloadLive?.success) {
            normalized = normalizeOllamaModels(payloadLive.data)
          } else if (payloadLive?.message) {
            lastErr = String(payloadLive.message)
          }
        } catch (err: unknown) {
          lastErr = err instanceof Error ? err.message : ''
        }
      }

      // 2) Fallback to server-side fetch by channelId
      if (!normalized.length) {
        const payload = await fetchUpstreamModels(Number(channelId))
        if (payload?.success) {
          normalized = normalizeOllamaModels(payload.data)
          lastErr = ''
        } else {
          lastErr = String(payload?.message || '')
        }
      }

      if (!normalized.length && lastErr) {
        toast.error(lastErr || t('Failed to fetch models'))
      }

      setModels(normalized)
      setSelected((prev) => {
        if (!prev.length) return normalized.map((m) => m.id)
        const stillAvailable = prev.filter((id) =>
          normalized.some((m) => m.id === id)
        )
        return stillAvailable.length
          ? stillAvailable
          : normalized.map((m) => m.id)
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined
      toast.error(msg || t('Failed to fetch models'))
      setModels([])
    } finally {
      setIsFetching(false)
    }
  }, [channelId, currentRow, isOllamaChannel, t])

  const toggleSelected = (modelId: string, checked: boolean) => {
    setSelected((prev) => {
      if (checked) return prev.includes(modelId) ? prev : [...prev, modelId]
      return prev.filter((id) => id !== modelId)
    })
  }

  const selectAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      filteredModels.forEach((m) => next.add(m.id))
      return [...next]
    })
  }

  const clearSelection = () => setSelected([])

  const applySelection = async (mode: 'append' | 'replace') => {
    if (!currentRow) return
    if (!selected.length) {
      toast.info(t('No models selected'))
      return
    }

    const next =
      mode === 'replace'
        ? [...new Set(selected)]
        : [...new Set([...existingModels, ...selected])]

    try {
      const res = await updateChannel(currentRow.id, { models: next.join(',') })
      if (res.success) {
        toast.success(
          mode === 'replace'
            ? t('Models updated successfully')
            : t('Models appended successfully')
        )
        queryClient.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
      } else {
        toast.error(res.message || t('Failed to update models'))
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t('Failed to update models')
      )
    }
  }

  const pullModel = async () => {
    if (!channelId) return
    if (!pullName.trim()) {
      toast.error(t('Please enter model name'))
      return
    }

    if (!resolveOllamaBaseUrl(currentRow)) {
      toast.error(t('Please set Ollama API Base URL first'))
      return
    }

    pullAbortRef.current?.abort()
    const controller = new AbortController()
    pullAbortRef.current = controller

    setIsPulling(true)
    setPullProgress({ status: 'starting', completed: 0, total: 0 })

    try {
      const authHeaders = await getFreshAuthHeaders()
      const response = await fetch('/api/channel/ollama/pull/stream', {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...authHeaders,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          channel_id: channelId,
          model_name: pullName.trim(),
        }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const eventData = line.slice(6)
          if (!eventData) continue

          if (eventData === '[DONE]') {
            setIsPulling(false)
            setPullProgress(null)
            pullAbortRef.current = null
            return
          }

          try {
            const data = JSON.parse(eventData)
            if (data?.status) {
              setPullProgress(data)
            } else if (data?.error) {
              toast.error(String(data.error))
              setIsPulling(false)
              setPullProgress(null)
              pullAbortRef.current = null
              return
            } else if (data?.message) {
              toast.success(String(data.message))
              setPullName('')
              setIsPulling(false)
              setPullProgress(null)
              pullAbortRef.current = null
              await fetchOllamaModels()
              queryClient.invalidateQueries({
                queryKey: channelsQueryKeys.lists(),
              })
              return
            }
          } catch {
            // ignore malformed events
          }
        }
      }

      setIsPulling(false)
      setPullProgress(null)
      pullAbortRef.current = null
      await fetchOllamaModels()
      queryClient.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
    } catch (err: unknown) {
      const isAbort =
        typeof err === 'object' &&
        err !== null &&
        'name' in err &&
        (err as { name?: unknown }).name === 'AbortError'
      if (!isAbort) {
        const msg = err instanceof Error ? err.message : ''
        toast.error(t('Model pull failed: {{msg}}', { msg }))
      }
      setIsPulling(false)
      setPullProgress(null)
      pullAbortRef.current = null
    }
  }

  const deleteModel = async (modelName: string) => {
    if (!channelId) return
    try {
      setIsDeleting(true)
      const payload = await deleteOllamaModel({
        channel_id: Number(channelId),
        model_name: modelName,
      })
      if (payload?.success) {
        toast.success(t('Model deleted'))
        await fetchOllamaModels()
        queryClient.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
        setDeleteOpen(false)
        setDeleteTarget(null)
      } else {
        toast.error(payload?.message || t('Failed to delete model'))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined
      toast.error(msg || t('Failed to delete model'))
    } finally {
      setIsDeleting(false)
    }
  }

  const close = () => {
    pullAbortRef.current?.abort()
    pullAbortRef.current = null
    onOpenChange(false)
  }

  return {
    currentRow,
    isOllamaChannel,
    channelId,
    isFetching,
    selected,
    search,
    setSearch,
    pullName,
    setPullName,
    isPulling,
    pullProgress,
    deleteOpen,
    setDeleteOpen,
    deleteTarget,
    setDeleteTarget,
    isDeleting,
    filteredModels,
    fetchOllamaModels,
    toggleSelected,
    selectAllFiltered,
    clearSelection,
    applySelection,
    pullModel,
    deleteModel,
    close,
  }
}
