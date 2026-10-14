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
import { useMemo } from 'react'

import {
  buildModelSnapshots,
  getSnapshotSignature,
  isBasePricingUnset,
  type ModelPricingSnapshotInput,
} from './model-pricing-snapshots'

/** Compares persisted and draft pricing without exposing editor or table state. */
export function useModelPricingRows({
  saved,
  draft,
  filterMode,
  candidateModelNames,
}: {
  saved: ModelPricingSnapshotInput
  draft: ModelPricingSnapshotInput
  filterMode: 'all' | 'unset'
  candidateModelNames?: string[]
}) {
  const {
    modelPrice: savedModelPrice,
    modelRatio: savedModelRatio,
    cacheRatio: savedCacheRatio,
    createCacheRatio: savedCreateCacheRatio,
    completionRatio: savedCompletionRatio,
    imageRatio: savedImageRatio,
    audioRatio: savedAudioRatio,
    audioCompletionRatio: savedAudioCompletionRatio,
    billingMode: savedBillingMode,
    billingExpr: savedBillingExpr,
  } = saved
  const {
    modelPrice,
    modelRatio,
    cacheRatio,
    createCacheRatio,
    completionRatio,
    imageRatio,
    audioRatio,
    audioCompletionRatio,
    billingMode,
    billingExpr,
  } = draft
  const models = useMemo(() => {
    const savedRows = buildModelSnapshots({
      modelPrice: savedModelPrice,
      modelRatio: savedModelRatio,
      cacheRatio: savedCacheRatio,
      createCacheRatio: savedCreateCacheRatio,
      completionRatio: savedCompletionRatio,
      imageRatio: savedImageRatio,
      audioRatio: savedAudioRatio,
      audioCompletionRatio: savedAudioCompletionRatio,
      billingMode: savedBillingMode,
      billingExpr: savedBillingExpr,
    })
    const draftRows = buildModelSnapshots({
      modelPrice,
      modelRatio,
      cacheRatio,
      createCacheRatio,
      completionRatio,
      imageRatio,
      audioRatio,
      audioCompletionRatio,
      billingMode,
      billingExpr,
    })

    const savedByName = new Map(savedRows.map((row) => [row.name, row]))
    const draftByName = new Map(draftRows.map((row) => [row.name, row]))
    const modelNames =
      filterMode === 'unset'
        ? new Set(candidateModelNames ?? [])
        : new Set([...savedByName.keys(), ...draftByName.keys()])

    return [...modelNames]
      .map((name) => {
        const saved = savedByName.get(name)
        const draft = draftByName.get(name)
        const displayed = saved ??
          draft ?? { name, billingMode: 'per-token', hasConflict: false }
        const savedSignature = getSnapshotSignature(saved)
        const draftSignature = getSnapshotSignature(draft)

        return {
          ...displayed,
          saved,
          draft,
          isDraftChanged: savedSignature !== draftSignature,
          isDraftDeleted: Boolean(saved && !draft),
          isDraftNew: Boolean(!saved && draft),
        }
      })
      .filter((row) => !row.isDraftDeleted)
      .filter((row) => filterMode !== 'unset' || isBasePricingUnset(row.saved))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [
    candidateModelNames,
    filterMode,
    savedModelPrice,
    savedModelRatio,
    savedCacheRatio,
    savedCreateCacheRatio,
    savedCompletionRatio,
    savedImageRatio,
    savedAudioRatio,
    savedAudioCompletionRatio,
    savedBillingMode,
    savedBillingExpr,
    modelPrice,
    modelRatio,
    cacheRatio,
    createCacheRatio,
    completionRatio,
    imageRatio,
    audioRatio,
    audioCompletionRatio,
    billingMode,
    billingExpr,
  ])
  return { models }
}
