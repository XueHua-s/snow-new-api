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
import { MAX_CHART_TREND_POINTS } from '@/features/dashboard/constants'
import type { QuotaDataItem } from '@/features/dashboard/types'
import { getCurrencyDisplay } from '@/lib/currency'
import { formatChartTime, type TimeGranularity } from '@/lib/time'

import { getDashboardChartColors } from './chart-format'

export function aggregateChartData({
  data,
  timeGranularity,
  otherLabel,
}: {
  data: QuotaDataItem[]
  timeGranularity: TimeGranularity
  otherLabel: string
}) {
  const { config } = getCurrencyDisplay()

  const quotaPerUnit = config.quotaPerUnit

  const timeModelMap = new Map<
    string,
    Map<string, { quota: number; count: number; tokens: number }>
  >()

  const modelTotalsMap = new Map<
    string,
    { quota: number; count: number; tokens: number }
  >()

  data.forEach((item) => {
    const timestamp = Number(item.created_at)
    const timeKey = formatChartTime(timestamp, timeGranularity)
    const model = item.model_name || 'Unknown'
    const quota = Number(item.quota) || 0
    const count = Number(item.count) || 0
    const tokens = Number(item.token_used) || 0

    // Aggregate by time and model
    const modelMap =
      timeModelMap.get(timeKey) ??
      new Map<string, { quota: number; count: number; tokens: number }>()
    timeModelMap.set(timeKey, modelMap)
    const existing = modelMap.get(model) || { quota: 0, count: 0, tokens: 0 }
    modelMap.set(model, {
      quota: existing.quota + quota,
      count: existing.count + count,
      tokens: existing.tokens + tokens,
    })

    // Calculate totals
    const totalExisting = modelTotalsMap.get(model) || {
      quota: 0,
      count: 0,
      tokens: 0,
    }
    modelTotalsMap.set(model, {
      quota: totalExisting.quota + quota,
      count: totalExisting.count + count,
      tokens: totalExisting.tokens + tokens,
    })
  })

  const allModels = [...modelTotalsMap.keys()]

  const sortedTimes = [...timeModelMap.keys()].sort()

  const sortedModels = [...allModels].sort()

  const modelColorDomain = [...new Set([...sortedModels, otherLabel])]

  const modelColorRange = getDashboardChartColors(modelColorDomain.length)

  const otherColor = modelColorRange[modelColorDomain.indexOf(otherLabel)]

  const otherTooltipColor =
    typeof otherColor === 'string' ? otherColor : '#FF8A00'

  const modelColor = {
    type: 'ordinal',
    domain: modelColorDomain,
    range: modelColorRange,
  }

  const MAX_TREND_POINTS = MAX_CHART_TREND_POINTS

  const fillTimePoints = (times: string[]) => {
    if (times.length >= MAX_TREND_POINTS) return times
    const lastTime = Math.max(
      ...data.map((item) => Number(item.created_at) || 0)
    )
    let intervalSec
    if (timeGranularity === 'week') {
      intervalSec = 604800
    } else {
      if (timeGranularity === 'day') {
        intervalSec = 86400
      } else {
        intervalSec = 3600
      }
    }
    const padded = Array.from({ length: MAX_TREND_POINTS }, (_, i) =>
      formatChartTime(
        lastTime - (MAX_TREND_POINTS - 1 - i) * intervalSec,
        timeGranularity
      )
    )
    return padded
  }

  const chartTimes = fillTimePoints(sortedTimes)

  const totalTimes = [...modelTotalsMap.values()].reduce(
    (sum, x) => sum + (Number(x.count) || 0),
    0
  )

  const totalQuotaRaw = [...modelTotalsMap.values()].reduce(
    (sum, x) => sum + (Number(x.quota) || 0),
    0
  )

  const pieValues = [...modelTotalsMap.entries()]
    .map(([model, stats]) => ({
      type: model,
      value: Number(stats.count) || 0,
    }))
    .sort((a, b) => b.value - a.value)

  const lineValues: Array<{
    Time: string
    Model: string
    rawQuota: number
    Usage: number
    TimeSum: number
  }> = []

  chartTimes.forEach((time) => {
    let timeData = sortedModels.map((model) => {
      const stats = timeModelMap.get(time)?.get(model)
      const rawQuota = Number(stats?.quota) || 0
      const usd = rawQuota ? rawQuota / quotaPerUnit : 0
      // Match legacy frontend getQuotaWithUnit(..., 4)
      const usage = usd ? Number(usd.toFixed(4)) : 0
      return {
        Time: time,
        Model: model,
        rawQuota,
        Usage: usage,
        TimeSum: 0,
      }
    })

    const timeSum = timeData.reduce((sum, item) => sum + item.rawQuota, 0)
    timeData.sort((a, b) => b.rawQuota - a.rawQuota)
    timeData = timeData.map((item) => ({ ...item, TimeSum: timeSum }))
    lineValues.push(...timeData)
  })

  lineValues.sort((a, b) => a.Time.localeCompare(b.Time))

  const MAX_AREA_MODELS = 15

  const rankedQuotaModels = [...modelTotalsMap.entries()]
    .map(([model, stats]) => ({
      Model: model,
      Quota: Number(stats.quota) || 0,
    }))
    .sort((a, b) => b.Quota - a.Quota)

  const topAreaModels = new Set(
    rankedQuotaModels.slice(0, MAX_AREA_MODELS).map((m) => m.Model)
  )

  const areaValues: typeof lineValues = []

  chartTimes.forEach((time) => {
    const buckets = new Map<string, { rawQuota: number; usage: number }>()
    const modelMap = timeModelMap.get(time)
    let timeSum = 0
    sortedModels.forEach((model) => {
      const stats = modelMap?.get(model)
      const rawQuota = Number(stats?.quota) || 0
      const usd = rawQuota ? rawQuota / quotaPerUnit : 0
      const usage = usd ? Number(usd.toFixed(4)) : 0
      timeSum += rawQuota
      const key = topAreaModels.has(model) ? model : otherLabel
      const prev = buckets.get(key) || { rawQuota: 0, usage: 0 }
      buckets.set(key, {
        rawQuota: prev.rawQuota + rawQuota,
        usage: Number((prev.usage + usage).toFixed(4)),
      })
    })
    for (const [model, vals] of buckets) {
      areaValues.push({
        Time: time,
        Model: model,
        rawQuota: vals.rawQuota,
        Usage: vals.usage,
        TimeSum: timeSum,
      })
    }
  })

  areaValues.sort((a, b) => a.Time.localeCompare(b.Time))

  const MAX_TREND_MODELS = 20

  const rankedTrendModels = [...modelTotalsMap.entries()]
    .map(([model, stats]) => ({
      Model: model,
      Count: Number(stats.count) || 0,
    }))
    .sort((a, b) => b.Count - a.Count)

  const topTrendModels = rankedTrendModels
    .slice(0, MAX_TREND_MODELS)
    .map((item) => item.Model)

  const otherTrendModels = rankedTrendModels
    .slice(MAX_TREND_MODELS)
    .map((item) => item.Model)

  const modelLineValues: Array<{
    Time: string
    Model: string
    Count: number
  }> = []

  chartTimes.forEach((time) => {
    const timeData = topTrendModels.map((model) => {
      const stats = timeModelMap.get(time)?.get(model)
      return {
        Time: time,
        Model: model,
        Count: Number(stats?.count) || 0,
      }
    })
    if (otherTrendModels.length > 0) {
      const otherCount = otherTrendModels.reduce((sum, model) => {
        const stats = timeModelMap.get(time)?.get(model)
        return sum + (Number(stats?.count) || 0)
      }, 0)
      timeData.push({
        Time: time,
        Model: otherLabel,
        Count: otherCount,
      })
    }
    modelLineValues.push(...timeData)
  })

  modelLineValues.sort((a, b) => a.Time.localeCompare(b.Time))

  const MAX_RANK_MODELS = 20

  const allRankValues = [...modelTotalsMap.entries()]
    .map(([model, stats]) => ({
      Model: model,
      Count: Number(stats.count) || 0,
    }))
    .sort((a, b) => b.Count - a.Count)

  let rankValues: typeof allRankValues

  if (allRankValues.length > MAX_RANK_MODELS) {
    const topModels = allRankValues.slice(0, MAX_RANK_MODELS)
    const otherCount = allRankValues
      .slice(MAX_RANK_MODELS)
      .reduce((sum, item) => sum + item.Count, 0)
    rankValues = [...topModels, { Model: otherLabel, Count: otherCount }]
  } else {
    rankValues = allRankValues
  }
  return {
    otherTooltipColor,
    modelColor,
    totalTimes,
    totalQuotaRaw,
    pieValues,
    lineValues,
    areaValues,
    modelLineValues,
    rankValues,
  }
}
