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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { parsePruneObjectsDraft } from './param-override-prune'
import { parseReturnErrorDraft } from './param-override-return-error'
import {
  parseInitialState,
  buildOperationsJson,
} from './param-override-serialization'
import { TEMPLATE_PRESET_CONFIG } from './param-override-templates'
import {
  createDefaultOperation,
  isOperationBlank,
  normalizeOperation,
  verifyJSON,
} from './param-override-values'
import { useParamOverrideDrag } from './use-param-override-drag'
import { useParamOverrideJson } from './use-param-override-json'
import { useParamOverrideRules } from './use-param-override-rules'
import { useParamOverrideSerialization } from './use-param-override-serialization'

export type ParamOverrideEditorDialogProps = {
  open: boolean
  value: string
  onOpenChange: (open: boolean) => void
  onSave: (value: string) => void
}

export function useParamOverrideEditor(props: ParamOverrideEditorDialogProps) {
  const { t } = useTranslation()

  const [editMode, setEditMode] = useState<'visual' | 'json'>('visual')
  const [visualMode, setVisualMode] = useState<'operations' | 'legacy'>(
    'operations'
  )
  const [legacyValue, setLegacyValue] = useState('')
  const {
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
  } = useParamOverrideRules()

  const { jsonText, setJsonText, jsonError, setJsonError, handleJsonChange } =
    useParamOverrideJson()

  const [operationSearch, setOperationSearch] = useState('')

  const {
    draggedOperationId,
    setDraggedOperationId,
    dragOverOperationId,
    setDragOverOperationId,
    dragOverPosition,
    setDragOverPosition,
    resetDragState,
    handleDragStart,
    handleDragOver,
    handleDrop,
  } = useParamOverrideDrag(setOperations, setSelectedOperationId)

  const [templatePresetKey, setTemplatePresetKey] =
    useState('operations_default')

  // Initialize state when dialog opens
  useEffect(() => {
    if (!props.open) return
    const state = parseInitialState(props.value)
    setEditMode(state.editMode)
    setVisualMode(state.visualMode)
    setLegacyValue(state.legacyValue)
    setOperations(state.operations)
    setJsonText(state.jsonText)
    setJsonError(state.jsonError)
    setOperationSearch('')
    setSelectedOperationId(state.operations[0]?.id || '')
    setExpandedConditions({})
    setDraggedOperationId('')
    setDragOverOperationId('')
    setDragOverPosition('before')
    if (state.visualMode === 'legacy') {
      setTemplatePresetKey('legacy_default')
    } else {
      setTemplatePresetKey('operations_default')
    }
  }, [
    props.open,
    props.value,
    setOperations,
    setSelectedOperationId,
    setDraggedOperationId,
    setExpandedConditions,
    setDragOverOperationId,
    setDragOverPosition,
    setJsonError,
    setJsonText,
  ])

  // Keep selectedOperationId valid
  useEffect(() => {
    if (operations.length === 0) {
      setSelectedOperationId('')
      return
    }
    if (!operations.some((o) => o.id === selectedOperationId)) {
      setSelectedOperationId(operations[0].id)
    }
  }, [operations, selectedOperationId, setSelectedOperationId])

  // Template preset options filtered by group
  const templatePresetOptions = useMemo(
    () =>
      Object.entries(TEMPLATE_PRESET_CONFIG).map(([value, config]) => ({
        value,
        label: config.label,
      })),
    []
  )

  const operationCount = useMemo(
    () => operations.filter((o) => !isOperationBlank(o)).length,
    [operations]
  )

  const filteredOperations = useMemo(() => {
    const keyword = operationSearch.trim().toLowerCase()
    if (!keyword) return operations
    return operations.filter((op) => {
      const searchableText = [
        op.description,
        op.mode,
        op.path,
        op.from,
        op.to,
        op.value_text,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return searchableText.includes(keyword)
    })
  }, [operationSearch, operations])

  const selectedOperation = useMemo(
    () => operations.find((o) => o.id === selectedOperationId),
    [operations, selectedOperationId]
  )

  const selectedOperationIndex = useMemo(
    () => operations.findIndex((o) => o.id === selectedOperationId),
    [operations, selectedOperationId]
  )

  const returnErrorDraft = useMemo(() => {
    if (!selectedOperation || selectedOperation.mode !== 'return_error') {
      return null
    }
    return parseReturnErrorDraft(selectedOperation.value_text)
  }, [selectedOperation])

  const pruneObjectsDraft = useMemo(() => {
    if (!selectedOperation || selectedOperation.mode !== 'prune_objects') {
      return null
    }
    return parsePruneObjectsDraft(selectedOperation.value_text)
  }, [selectedOperation])

  const topOperationModes = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const op of operations) {
      const mode = op.mode || 'set'
      counts[mode] = (counts[mode] || 0) + 1
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [operations])

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  // Conditions

  // return_error draft

  // prune_objects draft

  // Drag and drop

  // ---------------------------------------------------------------------------
  // Mode switching & templates
  // ---------------------------------------------------------------------------

  const { buildVisualJson, visualValidationError, handleSave } =
    useParamOverrideSerialization({
      visualMode,
      legacyValue,
      operations,
      editMode,
      jsonText,
      props,
    })

  const switchToJsonMode = useCallback(() => {
    if (editMode === 'json') return
    try {
      setJsonText(buildVisualJson())
      setJsonError('')
    } catch (error) {
      toast.error((error as Error).message)
      if (visualMode === 'legacy') {
        setJsonText(legacyValue)
      } else {
        setJsonText(buildOperationsJson(operations, { validate: false }, t))
      }
      setJsonError(
        (error as Error).message || t('Parameter configuration error')
      )
    }
    setEditMode('json')
  }, [
    buildVisualJson,
    editMode,
    legacyValue,
    operations,
    t,
    visualMode,
    setJsonText,
    setJsonError,
  ])

  const switchToVisualMode = useCallback(() => {
    if (editMode === 'visual') return
    const trimmed = jsonText.trim()
    if (!trimmed) {
      const fallback = createDefaultOperation()
      setVisualMode('operations')
      setOperations([fallback])
      setSelectedOperationId(fallback.id)
      setLegacyValue('')
      setJsonError('')
      setEditMode('visual')
      return
    }
    if (!verifyJSON(trimmed)) {
      toast.error(t('Parameter override must be valid JSON format'))
      return
    }
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray(parsed.operations)
    ) {
      const nextOps =
        (parsed.operations as Record<string, unknown>[]).length > 0
          ? (parsed.operations as Record<string, unknown>[]).map(
              normalizeOperation
            )
          : [createDefaultOperation()]
      setVisualMode('operations')
      setOperations(nextOps)
      setSelectedOperationId(nextOps[0]?.id || '')
      setLegacyValue('')
      setJsonError('')
      setEditMode('visual')
      setTemplatePresetKey('operations_default')
      return
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const fallback = createDefaultOperation()
      setVisualMode('legacy')
      setLegacyValue(JSON.stringify(parsed, null, 2))
      setOperations([fallback])
      setSelectedOperationId(fallback.id)
      setJsonError('')
      setEditMode('visual')
      setTemplatePresetKey('legacy_default')
      return
    }
    toast.error(t('Parameter override must be a valid JSON object'))
  }, [
    editMode,
    jsonText,
    t,
    setOperations,
    setSelectedOperationId,
    setJsonError,
  ])

  const fillTemplate = useCallback(
    (mode: 'fill' | 'append') => {
      const preset =
        TEMPLATE_PRESET_CONFIG[templatePresetKey] ||
        TEMPLATE_PRESET_CONFIG.operations_default
      const payload = preset.payload as Record<string, unknown>

      if (preset.kind === 'legacy') {
        if (mode === 'append' && visualMode === 'legacy') {
          const trimmed = legacyValue.trim()
          let parsedCurrent: Record<string, unknown> = {}
          if (trimmed) {
            if (!verifyJSON(trimmed)) {
              toast.error(t('Current legacy JSON is invalid, cannot append'))
              return
            }
            parsedCurrent = JSON.parse(trimmed) as Record<string, unknown>
          }
          const merged = { ...payload, ...parsedCurrent }
          const text = JSON.stringify(merged, null, 2)
          setVisualMode('legacy')
          setLegacyValue(text)
          setOperations([createDefaultOperation()])
          setJsonText(text)
          setJsonError('')
          setEditMode('visual')
        } else {
          const text = JSON.stringify(payload, null, 2)
          setVisualMode('legacy')
          setLegacyValue(text)
          setOperations([createDefaultOperation()])
          setJsonText(text)
          setJsonError('')
          setEditMode('visual')
        }
        return
      }

      const operationsPayload = ((payload as Record<string, unknown>)
        .operations || []) as Record<string, unknown>[]

      if (mode === 'append') {
        const appended = operationsPayload.map(normalizeOperation)
        const existing =
          visualMode === 'operations'
            ? operations.filter((o) => !isOperationBlank(o))
            : []
        const nextOps = [...existing, ...appended]
        setVisualMode('operations')
        setOperations(nextOps.length > 0 ? nextOps : appended)
        setSelectedOperationId(nextOps[0]?.id || appended[0]?.id || '')
        setLegacyValue('')
        setJsonError('')
        setEditMode('visual')
        setJsonText('')
      } else {
        const nextOps = operationsPayload.map(normalizeOperation)
        const finalOps =
          nextOps.length > 0 ? nextOps : [createDefaultOperation()]
        setVisualMode('operations')
        setOperations(finalOps)
        setSelectedOperationId(finalOps[0]?.id || '')
        setJsonText(JSON.stringify({ operations: operationsPayload }, null, 2))
        setJsonError('')
        setEditMode('visual')
      }
    },
    [
      legacyValue,
      operations,
      templatePresetKey,
      visualMode,
      t,
      setOperations,
      setSelectedOperationId,
      setJsonError,
      setJsonText,
    ]
  )

  const resetEditorState = useCallback(() => {
    const fallback = createDefaultOperation()
    setVisualMode('operations')
    setLegacyValue('')
    setOperations([fallback])
    setSelectedOperationId(fallback.id)
    setJsonText('')
    setJsonError('')
    setTemplatePresetKey('operations_default')
    setEditMode('visual')
  }, [setOperations, setSelectedOperationId, setJsonText, setJsonError])

  // JSON mode

  // Save

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return {
    editMode,
    visualMode,
    legacyValue,
    setLegacyValue,
    operations,
    jsonText,
    jsonError,
    operationSearch,
    setOperationSearch,
    selectedOperationId,
    setSelectedOperationId,
    expandedConditions,
    setExpandedConditions,
    draggedOperationId,
    dragOverOperationId,
    dragOverPosition,
    templatePresetKey,
    setTemplatePresetKey,
    templatePresetOptions,
    operationCount,
    filteredOperations,
    selectedOperation,
    selectedOperationIndex,
    returnErrorDraft,
    pruneObjectsDraft,
    topOperationModes,
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
    resetDragState,
    handleDragStart,
    handleDragOver,
    handleDrop,
    switchToJsonMode,
    switchToVisualMode,
    fillTemplate,
    resetEditorState,
    handleJsonChange,
    visualValidationError,
    handleSave,
    expandAllConditions,
    collapseAllConditions,
  }
}
