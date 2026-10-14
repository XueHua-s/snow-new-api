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
import type { GetChannelsResponse, SearchChannelsResponse } from '../../types'

export type ModelRow = {
  model: string
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error'

export type TestResult = {
  status: TestStatus
  responseTime?: number
  completedAt?: number
  error?: string
  errorCode?: string
}

export type BatchProgress = {
  total: number
  completed: number
  success: number
  failed: number
}

export type ChannelTestCachePatch = {
  responseTime: number
  testTime: number
}

type LatestChannelTestCachePatch = {
  patch: ChannelTestCachePatch
  completedAt: number
}

export type ChannelListCache = GetChannelsResponse | SearchChannelsResponse

export function createChannelTestCachePatch(
  responseTime?: number,
  completedAt = Date.now()
): ChannelTestCachePatch | undefined {
  if (typeof responseTime !== 'number' || !Number.isFinite(responseTime)) {
    return undefined
  }

  return {
    responseTime,
    testTime: Math.floor(completedAt / 1000),
  }
}

export function getLatestChannelTestCachePatch(
  results: TestResult[]
): ChannelTestCachePatch | undefined {
  const latest = results.reduce<LatestChannelTestCachePatch | undefined>(
    (latestPatch, result) => {
      const completedAt = result.completedAt ?? 0
      const patch = createChannelTestCachePatch(
        result.responseTime,
        completedAt
      )
      if (!patch) return latestPatch
      if (!latestPatch || completedAt >= latestPatch.completedAt) {
        return { patch, completedAt }
      }
      return latestPatch
    },
    undefined
  )

  return latest?.patch
}

export const endpointTypeOptions: Array<{ value: string; label: string }> = [
  { value: 'auto', label: 'Auto detect (default)' },
  { value: 'openai', label: 'OpenAI (/v1/chat/completions)' },
  { value: 'openai-response', label: 'OpenAI Responses (/v1/responses)' },
  {
    value: 'openai-response-compact',
    label: 'OpenAI Response Compaction (/v1/responses/compact)',
  },
  { value: 'anthropic', label: 'Anthropic (/v1/messages)' },
  {
    value: 'gemini',
    label: 'Gemini (/v1beta/models/{model}:generateContent)',
  },
  { value: 'jina-rerank', label: 'Jina Rerank (/v1/rerank)' },
  {
    value: 'image-generation',
    label: 'Image Generation (/v1/images/generations)',
  },
  { value: 'embeddings', label: 'Embeddings (/v1/embeddings)' },
]

export const endpointSelectContentClass = 'w-[460px] max-w-[calc(100vw-2rem)]'

export const endpointSelectItemClass =
  'items-start py-2 [&_[data-slot=select-item-text]]:min-w-0 [&_[data-slot=select-item-text]]:shrink [&_[data-slot=select-item-text]]:whitespace-normal'

export const STREAM_INCOMPATIBLE_ENDPOINTS = new Set([
  'embeddings',
  'image-generation',
  'jina-rerank',
  'openai-response-compact',
])

export const MODEL_PRICE_ERROR_CODE = 'model_price_error'

const FAILURE_SUMMARY_MAX_LENGTH = 96

export const BATCH_TEST_CONCURRENCY = 5

export const BATCH_TEST_DELAY_MS = 100

type FailureStatusDisplay = {
  summary: string
  details?: string
}

export type FailureDetailsState = {
  model: string
  summary: string
  details: string
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function normalizeInlineError(errorText: string) {
  return errorText.replaceAll(/\s+/g, ' ').trim()
}

function getFirstErrorLine(errorText: string) {
  return errorText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
}

function truncateFailureSummary(summary: string) {
  if (summary.length <= FAILURE_SUMMARY_MAX_LENGTH) {
    return summary
  }

  return `${summary.slice(0, FAILURE_SUMMARY_MAX_LENGTH).trimEnd()}...`
}

export function getFailureStatusDisplay({
  errorText,
  fallbackSummary,
  isModelPriceError,
  modelPriceSummary,
}: {
  errorText?: string
  fallbackSummary: string
  isModelPriceError: boolean
  modelPriceSummary: string
}): FailureStatusDisplay {
  const rawError = errorText?.trim()

  if (!rawError) {
    return { summary: fallbackSummary }
  }

  if (isModelPriceError) {
    return {
      summary: modelPriceSummary,
      details: rawError === modelPriceSummary ? undefined : rawError,
    }
  }

  const firstLine = getFirstErrorLine(rawError) ?? rawError
  const summary = truncateFailureSummary(normalizeInlineError(firstLine))
  const normalizedRawError = normalizeInlineError(rawError)

  return {
    summary,
    details: summary === normalizedRawError ? undefined : rawError,
  }
}

export function getTestTableColumnClass(columnId: string) {
  switch (columnId) {
    case 'select':
      return 'w-10 min-w-10'
    case 'model':
      return 'w-auto min-w-48 whitespace-nowrap'
    case 'status':
      return 'w-28 min-w-28 whitespace-nowrap'
    case 'result':
      return 'w-80 min-w-80 max-w-80 whitespace-normal'
    case 'actions':
      return 'bg-popover w-px whitespace-nowrap'
    default:
      return undefined
  }
}
