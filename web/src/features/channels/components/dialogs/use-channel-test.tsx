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
import type { RowSelectionState } from '@tanstack/react-table'
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useDataTable } from '../../../../components/data-table/hooks/use-data-table'
import { updateChannel } from '../../api'
import { channelsQueryKeys, handleTestChannel } from '../../lib'
import type { Channel } from '../../types'
import { useChannelTestColumns } from './channel-test-columns'
import {
  type TestResult,
  type BatchProgress,
  type FailureDetailsState,
  endpointTypeOptions,
  STREAM_INCOMPATIBLE_ENDPOINTS,
  type ModelRow,
  type ChannelTestCachePatch,
  type ChannelListCache,
  createChannelTestCachePatch,
} from './channel-test-data'
import type { ChannelTestDialogProps } from './channel-test-dialog'
import { useChannelBatchTest } from './use-channel-batch-test'

export type ChannelTestDialogContentProps = ChannelTestDialogProps & {
  currentRow: Channel
}

export function useChannelTest({
  onOpenChange,
  currentRow,
}: ChannelTestDialogContentProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentChannelId = currentRow.id
  const batchStopRequestedRef = useRef(false)
  const batchProgressToastIdRef = useRef<ReturnType<
    typeof toast.loading
  > | null>(null)
  const [endpointType, setEndpointType] = useState('auto')
  const [isStreamTest, setIsStreamTest] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [testingModels, setTestingModels] = useState<Set<string>>(
    () => new Set()
  )
  const [isBatchTesting, setIsBatchTesting] = useState(false)
  const [isBatchStopRequested, setIsBatchStopRequested] = useState(false)
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [removedModels, setRemovedModels] = useState<Set<string>>(
    () => new Set()
  )
  const [isDeleteFailedDialogOpen, setIsDeleteFailedDialogOpen] =
    useState(false)
  const [isDeletingFailed, setIsDeletingFailed] = useState(false)
  const [failureDetails, setFailureDetails] =
    useState<FailureDetailsState | null>(null)
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 30,
  })
  const endpointSelectItems = useMemo(
    () =>
      endpointTypeOptions.map((option) => ({
        value: option.value,
        label: t(option.label),
      })),
    [t]
  )

  const dismissBatchProgressToast = useCallback(() => {
    if (batchProgressToastIdRef.current === null) return

    toast.dismiss(batchProgressToastIdRef.current)
    batchProgressToastIdRef.current = null
  }, [])

  useEffect(() => {
    if (!batchProgress) {
      dismissBatchProgressToast()
      return
    }

    const title = isBatchStopRequested
      ? t('Stopping batch test...')
      : t('Batch testing models...')
    const completedText = t('{{completed}}/{{total}} completed', {
      completed: batchProgress.completed,
      total: batchProgress.total,
    })
    const resultText = t('{{success}} succeeded, {{failed}} failed', {
      success: batchProgress.success,
      failed: batchProgress.failed,
    })

    batchProgressToastIdRef.current = toast.loading(title, {
      id: batchProgressToastIdRef.current ?? undefined,
      description: `${completedText} · ${resultText}`,
    })
  }, [batchProgress, dismissBatchProgressToast, isBatchStopRequested, t])

  useEffect(() => dismissBatchProgressToast, [dismissBatchProgressToast])

  const resetState = useCallback(() => {
    batchStopRequestedRef.current = true
    setEndpointType('auto')
    setIsStreamTest(false)
    setSearchTerm('')
    setTestResults({})
    setRowSelection({})
    setTestingModels(() => new Set())
    setIsBatchTesting(false)
    setIsBatchStopRequested(false)
    setBatchProgress(null)
    setRemovedModels(() => new Set())
    setIsDeleteFailedDialogOpen(false)
    setIsDeletingFailed(false)
    setFailureDetails(null)
    setPagination({ pageIndex: 0, pageSize: 30 })
  }, [])

  const streamDisabled = STREAM_INCOMPATIBLE_ENDPOINTS.has(endpointType)
  const effectiveStreamTest = !streamDisabled && isStreamTest

  const handleEndpointTypeChange = useCallback((value: string | null) => {
    if (value === null) return

    setEndpointType(value)
    if (STREAM_INCOMPATIBLE_ENDPOINTS.has(value)) {
      setIsStreamTest(false)
    }
  }, [])

  const handleSearchTermChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(event.target.value)
      setPagination((prev) =>
        prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }
      )
    },
    []
  )

  const modelsValue = currentRow.models
  const defaultTestModel = currentRow.test_model?.trim()

  const baseModels = useMemo(() => {
    if (!modelsValue) return []
    return modelsValue
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean)
  }, [modelsValue])

  const models = useMemo(
    () => baseModels.filter((model) => !removedModels.has(model)),
    [baseModels, removedModels]
  )

  const successModels = useMemo(
    () => models.filter((model) => testResults[model]?.status === 'success'),
    [models, testResults]
  )

  const failedModels = useMemo(
    () => models.filter((model) => testResults[model]?.status === 'error'),
    [models, testResults]
  )

  const filteredModels = useMemo(() => {
    if (!searchTerm) return models
    const keyword = searchTerm.toLowerCase()
    return models.filter((model) => model.toLowerCase().includes(keyword))
  }, [models, searchTerm])

  const tableData = useMemo<ModelRow[]>(
    () => filteredModels.map((model) => ({ model })),
    [filteredModels]
  )

  const markModelTesting = useCallback((key: string, isTesting: boolean) => {
    setTestingModels((prev) => {
      const next = new Set(prev)
      if (isTesting) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }, [])

  const updateTestResult = useCallback((key: string, result: TestResult) => {
    setFailureDetails((current) => (current?.model === key ? null : current))
    setTestResults((prev) => ({
      ...prev,
      [key]: result,
    }))
  }, [])

  const updateChannelTestCache = useCallback(
    (patch?: ChannelTestCachePatch) => {
      if (!patch) return

      queryClient.setQueriesData<ChannelListCache>(
        { queryKey: channelsQueryKeys.lists() },
        (oldData) => {
          const data = oldData?.data
          if (!oldData || !data?.items.length) return oldData

          let changed = false
          const nextItems = data.items.map((channel) => {
            if (channel.id !== currentChannelId) return channel

            changed = true
            return {
              ...channel,
              response_time: patch.responseTime,
              test_time: patch.testTime,
            }
          })

          if (!changed) return oldData

          return {
            ...oldData,
            data: {
              ...data,
              items: nextItems,
            },
          }
        }
      )
    },
    [currentChannelId, queryClient]
  )

  const refreshChannelLists = useCallback(
    (patch?: ChannelTestCachePatch) => {
      updateChannelTestCache(patch)
      void queryClient
        .invalidateQueries({ queryKey: channelsQueryKeys.lists() })
        .then(() => updateChannelTestCache(patch))
        .catch(() => undefined)
    },
    [queryClient, updateChannelTestCache]
  )

  const testSingleModel = useCallback(
    async (
      model: string,
      silent = false,
      refreshList = true
    ): Promise<TestResult | undefined> => {
      if (!currentRow) return

      markModelTesting(model, true)
      updateTestResult(model, { status: 'testing' })
      let finalResult: TestResult | undefined

      try {
        await handleTestChannel(
          currentRow.id,
          {
            channelName: currentRow.name,
            testModel: model,
            endpointType: endpointType === 'auto' ? undefined : endpointType,
            stream: effectiveStreamTest || undefined,
            silent,
          },
          (success, responseTime, error, errorCode) => {
            const completedAt = Date.now()
            finalResult = {
              status: success ? 'success' : 'error',
              responseTime,
              completedAt,
              error,
              errorCode,
            }
            updateTestResult(model, finalResult)
          }
        )
      } catch (error: unknown) {
        finalResult = {
          status: 'error',
          completedAt: Date.now(),
          error: error instanceof Error ? error.message : t('Test failed'),
        }
        updateTestResult(model, finalResult)
      } finally {
        markModelTesting(model, false)
        if (refreshList) {
          refreshChannelLists(
            createChannelTestCachePatch(
              finalResult?.responseTime,
              finalResult?.completedAt
            )
          )
        }
      }
      return finalResult
    },
    [
      currentRow,
      endpointType,
      effectiveStreamTest,
      markModelTesting,
      refreshChannelLists,
      t,
      updateTestResult,
    ]
  )

  const { handleStopBatchTest, handleBatchTest } = useChannelBatchTest({
    isBatchTesting,
    isBatchStopRequested,
    batchStopRequestedRef,
    setIsBatchStopRequested,
    setIsBatchTesting,
    setBatchProgress,
    testSingleModel,
    updateTestResult,
    dismissBatchProgressToast,
    setRowSelection,
    refreshChannelLists,
  })

  const handleSelectSuccessfulModels = useCallback(() => {
    setRowSelection(() => {
      const next: RowSelectionState = {}
      for (const model of successModels) {
        next[model] = true
      }
      return next
    })
  }, [successModels])

  const handleDeleteFailedModels = useCallback(async () => {
    const failed = models.filter(
      (model) => testResults[model]?.status === 'error'
    )
    if (!failed.length) {
      setIsDeleteFailedDialogOpen(false)
      return
    }

    const failedSet = new Set(failed)
    const remaining = models.filter((model) => !failedSet.has(model))

    setIsDeletingFailed(true)
    try {
      const response = await updateChannel(currentRow.id, {
        models: remaining.join(','),
      })
      if (response.success) {
        setRemovedModels((prev) => {
          const next = new Set(prev)
          for (const model of failed) next.add(model)
          return next
        })
        setTestResults((prev) => {
          const next = { ...prev }
          for (const model of failed) delete next[model]
          return next
        })
        setRowSelection((prev) => {
          const next = { ...prev }
          for (const model of failed) delete next[model]
          return next
        })
        toast.success(
          t('Deleted {{count}} failed models', { count: failed.length })
        )
        refreshChannelLists()
        setIsDeleteFailedDialogOpen(false)
      } else {
        toast.error(response.message || t('Failed to delete failed models'))
      }
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Failed to delete failed models')
      )
    } finally {
      setIsDeletingFailed(false)
    }
  }, [currentRow.id, models, refreshChannelLists, t, testResults])

  const handleClose = useCallback(() => {
    resetState()
    onOpenChange(false)
  }, [onOpenChange, resetState])

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleClose()
      }
    },
    [handleClose]
  )

  const isAnyTesting = testingModels.size > 0 || isBatchTesting
  const isFilteringModels = searchTerm.trim().length > 0
  const testAllButtonLabel = isFilteringModels
    ? t('Test {{count}} matching models', { count: filteredModels.length })
    : t('Test all {{count}} models', { count: filteredModels.length })

  const { columns } = useChannelTestColumns({
    defaultTestModel,
    testResults,
    setFailureDetails,
    testingModels,
    testSingleModel,
    isBatchTesting,
  })

  const { table } = useDataTable({
    data: tableData,
    columns,
    rowSelection,
    pagination,
    enableRowSelection: true,
    getRowId: (row) => row.model,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    withFilteredRowModel: false,
    withSortedRowModel: false,
    withFacetedRowModel: false,
  })

  return {
    endpointType,
    setIsStreamTest,
    searchTerm,
    isBatchTesting,
    isBatchStopRequested,
    isDeleteFailedDialogOpen,
    setIsDeleteFailedDialogOpen,
    isDeletingFailed,
    failureDetails,
    setFailureDetails,
    endpointSelectItems,
    streamDisabled,
    effectiveStreamTest,
    handleEndpointTypeChange,
    handleSearchTermChange,
    models,
    successModels,
    failedModels,
    filteredModels,
    handleStopBatchTest,
    handleBatchTest,
    handleSelectSuccessfulModels,
    handleDeleteFailedModels,
    handleClose,
    handleDialogOpenChange,
    isAnyTesting,
    testAllButtonLabel,
    table,
  }
}
