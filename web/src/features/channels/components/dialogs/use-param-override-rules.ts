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
import { useCallback, useState } from 'react'

import type {
  ParamOverrideOperation,
  ParamOverrideCondition,
} from './param-override-definitions'
import {
  parsePruneObjectsDraft,
  type PruneObjectsDraft,
  buildPruneObjectsValueText,
  normalizePruneRule,
  type PruneRule,
} from './param-override-prune'
import {
  parseReturnErrorDraft,
  type ReturnErrorDraft,
  buildReturnErrorValueText,
} from './param-override-return-error'
import {
  createDefaultOperation,
  normalizeOperation,
  parseLooseValue,
  createDefaultCondition,
} from './param-override-values'

export function useParamOverrideRules() {
  const [operations, setOperations] = useState<ParamOverrideOperation[]>([
    createDefaultOperation(),
  ])

  const [selectedOperationId, setSelectedOperationId] = useState('')

  const [expandedConditions, setExpandedConditions] = useState<
    Record<string, boolean>
  >({})

  const updateOperation = useCallback(
    (operationId: string, patch: Partial<ParamOverrideOperation>) => {
      setOperations((prev) =>
        prev.map((o) => (o.id === operationId ? { ...o, ...patch } : o))
      )
    },
    []
  )

  const addOperation = useCallback(() => {
    const created = createDefaultOperation()
    setOperations((prev) => [...prev, created])
    setSelectedOperationId(created.id)
  }, [])

  const duplicateOperation = useCallback((operationId: string) => {
    let insertedId = ''
    setOperations((prev) => {
      const idx = prev.findIndex((o) => o.id === operationId)
      if (idx < 0) return prev
      const source = prev[idx]
      const cloned = normalizeOperation({
        description: source.description,
        path: source.path,
        mode: source.mode,
        value: parseLooseValue(source.value_text),
        keep_origin: source.keep_origin,
        from: source.from,
        to: source.to,
        logic: source.logic,
        conditions: source.conditions.map((c) => ({
          path: c.path,
          mode: c.mode,
          value: parseLooseValue(c.value_text),
          invert: c.invert,
          pass_missing_key: c.pass_missing_key,
        })),
      })
      insertedId = cloned.id
      const next = [...prev]
      next.splice(idx + 1, 0, cloned)
      return next
    })
    if (insertedId) setSelectedOperationId(insertedId)
  }, [])

  const removeOperation = useCallback((operationId: string) => {
    setOperations((prev) => {
      if (prev.length <= 1) return [createDefaultOperation()]
      return prev.filter((o) => o.id !== operationId)
    })
  }, [])

  const addCondition = useCallback((operationId: string) => {
    const created = createDefaultCondition()
    setOperations((prev) =>
      prev.map((op) =>
        op.id === operationId
          ? { ...op, conditions: [...op.conditions, created] }
          : op
      )
    )
    setExpandedConditions((prev) => ({ ...prev, [created.id]: true }))
  }, [])

  const updateCondition = useCallback(
    (
      operationId: string,
      conditionId: string,
      patch: Partial<ParamOverrideCondition>
    ) => {
      setOperations((prev) =>
        prev.map((op) =>
          op.id === operationId
            ? {
                ...op,
                conditions: op.conditions.map((c) =>
                  c.id === conditionId ? { ...c, ...patch } : c
                ),
              }
            : op
        )
      )
    },
    []
  )

  const removeCondition = useCallback(
    (operationId: string, conditionId: string) => {
      setOperations((prev) =>
        prev.map((op) =>
          op.id === operationId
            ? {
                ...op,
                conditions: op.conditions.filter((c) => c.id !== conditionId),
              }
            : op
        )
      )
    },
    []
  )

  const updateReturnErrorDraft = useCallback(
    (operationId: string, draftPatch: Partial<ReturnErrorDraft>) => {
      setOperations((prev) =>
        prev.map((op) => {
          if (op.id !== operationId) return op
          const draft = parseReturnErrorDraft(op.value_text)
          const nextDraft = { ...draft, ...draftPatch }
          return {
            ...op,
            value_text: buildReturnErrorValueText(nextDraft),
          }
        })
      )
    },
    []
  )

  const updatePruneObjectsDraft = useCallback(
    (
      operationId: string,
      updater:
        | Partial<PruneObjectsDraft>
        | ((draft: PruneObjectsDraft) => PruneObjectsDraft)
    ) => {
      setOperations((prev) =>
        prev.map((op) => {
          if (op.id !== operationId) return op
          const draft = parsePruneObjectsDraft(op.value_text)
          const nextDraft =
            typeof updater === 'function'
              ? updater(draft)
              : { ...draft, ...updater }
          return {
            ...op,
            value_text: buildPruneObjectsValueText(nextDraft),
          }
        })
      )
    },
    []
  )

  const addPruneRule = useCallback(
    (operationId: string) => {
      updatePruneObjectsDraft(operationId, (draft) => ({
        ...draft,
        simpleMode: false,
        rules: [...draft.rules, normalizePruneRule({})],
      }))
    },
    [updatePruneObjectsDraft]
  )

  const updatePruneRule = useCallback(
    (operationId: string, ruleId: string, patch: Partial<PruneRule>) => {
      updatePruneObjectsDraft(operationId, (draft) => ({
        ...draft,
        rules: draft.rules.map((r) =>
          r.id === ruleId ? { ...r, ...patch } : r
        ),
      }))
    },
    [updatePruneObjectsDraft]
  )

  const removePruneRule = useCallback(
    (operationId: string, ruleId: string) => {
      updatePruneObjectsDraft(operationId, (draft) => ({
        ...draft,
        rules: draft.rules.filter((r) => r.id !== ruleId),
      }))
    },
    [updatePruneObjectsDraft]
  )
  // Expand/collapse all conditions
  const expandAllConditions = useCallback(() => {
    const selectedOperation = operations.find(
      (operation) => operation.id === selectedOperationId
    )
    if (!selectedOperation) return
    const map: Record<string, boolean> = {}
    for (const c of selectedOperation.conditions) map[c.id] = true
    setExpandedConditions((prev) => ({ ...prev, ...map }))
  }, [operations, selectedOperationId])

  const collapseAllConditions = useCallback(() => {
    const selectedOperation = operations.find(
      (operation) => operation.id === selectedOperationId
    )
    if (!selectedOperation) return
    const map: Record<string, boolean> = {}
    for (const c of selectedOperation.conditions) map[c.id] = false
    setExpandedConditions((prev) => ({ ...prev, ...map }))
  }, [operations, selectedOperationId])

  return {
    expandAllConditions,
    collapseAllConditions,
    operations,
    setOperations,
    selectedOperationId,
    setSelectedOperationId,
    expandedConditions,
    setExpandedConditions,
    updateOperation,
    addOperation,
    duplicateOperation,
    removeOperation,
    addCondition,
    updateCondition,
    removeCondition,
    updateReturnErrorDraft,
    updatePruneObjectsDraft,
    addPruneRule,
    updatePruneRule,
    removePruneRule,
  }
}
