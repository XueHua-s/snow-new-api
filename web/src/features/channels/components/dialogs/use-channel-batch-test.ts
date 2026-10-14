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
import type { RowSelectionState } from '@tanstack/react-table'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  type TestResult,
  type BatchProgress,
  type ChannelTestCachePatch,
  BATCH_TEST_CONCURRENCY,
  sleep,
  BATCH_TEST_DELAY_MS,
  getLatestChannelTestCachePatch,
} from './channel-test-data'

export function useChannelBatchTest({
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
}: {
  isBatchTesting: boolean
  isBatchStopRequested: boolean
  batchStopRequestedRef: React.RefObject<boolean>
  setIsBatchStopRequested: React.Dispatch<React.SetStateAction<boolean>>
  setIsBatchTesting: React.Dispatch<React.SetStateAction<boolean>>
  setBatchProgress: React.Dispatch<React.SetStateAction<BatchProgress | null>>
  testSingleModel: (
    model: string,
    silent?: boolean,
    refreshList?: boolean
  ) => Promise<TestResult | undefined>
  updateTestResult: (model: string, result: TestResult) => void
  dismissBatchProgressToast: () => void
  setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>
  refreshChannelLists: (patch?: ChannelTestCachePatch) => void
}) {
  const { t } = useTranslation()
  const handleStopBatchTest = useCallback(() => {
    if (!isBatchTesting || isBatchStopRequested) return

    batchStopRequestedRef.current = true
    setIsBatchStopRequested(true)
  }, [
    isBatchStopRequested,
    isBatchTesting,
    batchStopRequestedRef,
    setIsBatchStopRequested,
  ])

  const handleBatchTest = useCallback(
    async (modelsToTest: string[]) => {
      const uniqueModels = [
        ...new Set(modelsToTest.map((model) => model.trim()).filter(Boolean)),
      ]
      if (!uniqueModels.length) return

      batchStopRequestedRef.current = false
      setIsBatchTesting(true)
      setIsBatchStopRequested(false)
      setBatchProgress({
        total: uniqueModels.length,
        completed: 0,
        success: 0,
        failed: 0,
      })

      let resultPatch: ChannelTestCachePatch | undefined
      const results: TestResult[] = []
      let completedCount = 0
      let successCount = 0
      let failedCount = 0

      try {
        const createFallbackResult = (error?: unknown): TestResult => ({
          status: 'error',
          completedAt: Date.now(),
          error: error instanceof Error ? error.message : t('Test failed'),
        })

        const recordBatchResult = (result: TestResult) => {
          results.push(result)
          completedCount += 1
          if (result.status === 'success') {
            successCount += 1
          }
          failedCount = completedCount - successCount

          setBatchProgress({
            total: uniqueModels.length,
            completed: completedCount,
            success: successCount,
            failed: failedCount,
          })
        }

        for (
          let startIndex = 0;
          startIndex < uniqueModels.length;
          startIndex += BATCH_TEST_CONCURRENCY
        ) {
          if (batchStopRequestedRef.current) {
            break
          }

          const batch = uniqueModels.slice(
            startIndex,
            startIndex + BATCH_TEST_CONCURRENCY
          )
          const batchPromises = batch.map(async (modelName) => {
            try {
              const result = await testSingleModel(modelName, true, false)
              const finalResult = result ?? createFallbackResult()
              if (!result) {
                updateTestResult(modelName, finalResult)
              }
              recordBatchResult(finalResult)
              return finalResult
            } catch (error: unknown) {
              const fallbackResult = createFallbackResult(error)
              updateTestResult(modelName, fallbackResult)
              recordBatchResult(fallbackResult)
              return fallbackResult
            }
          })

          await Promise.allSettled(batchPromises)

          if (
            batchStopRequestedRef.current ||
            startIndex + BATCH_TEST_CONCURRENCY >= uniqueModels.length
          ) {
            break
          }

          await sleep(BATCH_TEST_DELAY_MS)
        }

        resultPatch = getLatestChannelTestCachePatch(results)
        const stopped =
          batchStopRequestedRef.current && completedCount < uniqueModels.length

        dismissBatchProgressToast()
        if (stopped) {
          toast.info(
            t(
              'Batch test stopped: {{completed}}/{{total}} completed, {{success}} succeeded, {{failed}} failed',
              {
                completed: completedCount,
                total: uniqueModels.length,
                success: successCount,
                failed: failedCount,
              }
            )
          )
        } else if (failedCount > 0) {
          toast.error(
            t(
              'Batch test completed: {{success}} succeeded, {{failed}} failed',
              {
                success: successCount,
                failed: failedCount,
              }
            )
          )
        } else {
          toast.success(
            t('Batch test completed: {{count}} succeeded', {
              count: successCount,
            })
          )
        }
      } finally {
        batchStopRequestedRef.current = false
        setIsBatchTesting(false)
        setIsBatchStopRequested(false)
        setBatchProgress(null)
        setRowSelection({})
        refreshChannelLists(resultPatch)
      }
    },
    [
      dismissBatchProgressToast,
      refreshChannelLists,
      t,
      testSingleModel,
      updateTestResult,
      setRowSelection,
      setBatchProgress,
      setIsBatchStopRequested,
      batchStopRequestedRef,
      setIsBatchTesting,
    ]
  )
  return { handleStopBatchTest, handleBatchTest }
}
