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
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import type { ParamOverrideOperation } from './param-override-definitions'
import { buildOperationsJson } from './param-override-serialization'
import { verifyJSON } from './param-override-values'
import type { ParamOverrideEditorDialogProps } from './use-param-override-editor'

export function useParamOverrideSerialization({
  visualMode,
  legacyValue,
  operations,
  editMode,
  jsonText,
  props,
}: {
  visualMode: 'operations' | 'legacy'
  legacyValue: string
  operations: ParamOverrideOperation[]
  editMode: 'visual' | 'json'
  jsonText: string
  props: ParamOverrideEditorDialogProps
}) {
  const { t } = useTranslation()
  const buildVisualJson = useCallback((): string => {
    if (visualMode === 'legacy') {
      const trimmed = legacyValue.trim()
      if (!trimmed) return ''
      if (!verifyJSON(trimmed)) {
        throw new Error(t('Parameter override must be valid JSON format'))
      }
      const parsed = JSON.parse(trimmed) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(t('Legacy format must be a JSON object'))
      }
      return JSON.stringify(parsed, null, 2)
    }
    return buildOperationsJson(operations, { validate: true }, t)
  }, [legacyValue, operations, t, visualMode])

  const visualValidationError = useMemo(() => {
    if (editMode !== 'visual') return ''
    try {
      buildVisualJson()
      return ''
    } catch (error) {
      return (error as Error)?.message || t('Parameter configuration error')
    }
  }, [buildVisualJson, editMode, t])

  const handleSave = useCallback(() => {
    try {
      let result = ''
      if (editMode === 'json') {
        const trimmed = jsonText.trim()
        if (trimmed) {
          if (!verifyJSON(trimmed)) {
            throw new Error(t('Parameter override must be valid JSON format'))
          }
          result = JSON.stringify(JSON.parse(trimmed), null, 2)
        }
      } else {
        result = buildVisualJson()
      }
      props.onSave(result)
      props.onOpenChange(false)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }, [buildVisualJson, editMode, jsonText, props, t])
  return { buildVisualJson, visualValidationError, handleSave }
}
