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
import { useEffect, useMemo, useState } from 'react'

import { useDebounce } from '@/hooks/use-debounce'
import { useIsMobile } from '@/hooks/use-mobile'

import { useModels } from '../models-provider'
import { FIELD_LABELS } from './upstream-conflict-format'

export type UpstreamConflictDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export type ConflictFieldRow = {
  id: string
  modelName: string
  fieldKey: string
  fieldLabel: string
  localValue: unknown
  upstreamValue: unknown
}

export function useUpstreamConflicts({ open }: UpstreamConflictDialogProps) {
  const queryClient = useQueryClient()
  const {
    upstreamConflicts = [],
    setUpstreamConflicts,
    syncWizardOptions,
  } = useModels()
  const isMobile = useIsMobile()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 200)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pageSize, setPageSize] = useState(10)
  const [pageIndex, setPageIndex] = useState(0)

  useEffect(() => {
    if (open) {
      setRowSelection({})
      setSearch('')
      setPageIndex(0)
    }
  }, [open, upstreamConflicts])

  const conflictRows = useMemo<ConflictFieldRow[]>(() => {
    return upstreamConflicts.flatMap((conflict) => {
      if (!conflict.fields?.length) {
        return []
      }

      return conflict.fields.map((field) => ({
        id: `${conflict.model_name}-${field.field}`,
        modelName: conflict.model_name,
        fieldKey: field.field,
        fieldLabel: FIELD_LABELS[field.field] || field.field,
        localValue: field.local,
        upstreamValue: field.upstream,
      }))
    })
  }, [upstreamConflicts])

  const totalModels = upstreamConflicts.length
  const totalFields = conflictRows.length
  const normalizedSearch = debouncedSearch.trim().toLowerCase()

  const { matchingModelNames, visibleRowIds } = useMemo(() => {
    if (!normalizedSearch) {
      return { matchingModelNames: null, visibleRowIds: null }
    }

    const modelMatches = new Set<string>()
    upstreamConflicts.forEach((conflict) => {
      const modelMatch = conflict.model_name
        ?.toLowerCase()
        .includes(normalizedSearch)

      if (modelMatch) {
        modelMatches.add(conflict.model_name)
        return
      }

      const fieldMatch = conflict.fields?.some((field) => {
        const label = FIELD_LABELS[field.field] || field.field
        return (
          label.toLowerCase().includes(normalizedSearch) ||
          field.field.toLowerCase().includes(normalizedSearch)
        )
      })

      if (fieldMatch) {
        modelMatches.add(conflict.model_name)
      }
    })

    const rowIdSet = new Set<string>()
    conflictRows.forEach((row) => {
      if (
        modelMatches.has(row.modelName) ||
        row.fieldLabel.toLowerCase().includes(normalizedSearch) ||
        row.fieldKey.toLowerCase().includes(normalizedSearch)
      ) {
        rowIdSet.add(row.id)
      }
    })

    return { matchingModelNames: modelMatches, visibleRowIds: rowIdSet }
  }, [normalizedSearch, upstreamConflicts, conflictRows])

  return {
    queryClient,
    setUpstreamConflicts,
    syncWizardOptions,
    isMobile,
    search,
    setSearch,
    isSubmitting,
    setIsSubmitting,
    rowSelection,
    setRowSelection,
    pageSize,
    setPageSize,
    pageIndex,
    setPageIndex,
    conflictRows,
    totalModels,
    totalFields,
    matchingModelNames,
    visibleRowIds,
  }
}
