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
import {
  type Dispatch,
  type SetStateAction,
  type DragEvent,
  useCallback,
  useState,
} from 'react'

import type { ParamOverrideOperation } from './param-override-definitions'
import { reorderOperations } from './param-override-values'

export function useParamOverrideDrag(
  setOperations: Dispatch<SetStateAction<ParamOverrideOperation[]>>,
  setSelectedOperationId: Dispatch<SetStateAction<string>>
) {
  const [draggedOperationId, setDraggedOperationId] = useState('')

  const [dragOverOperationId, setDragOverOperationId] = useState('')

  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after'>(
    'before'
  )

  const resetDragState = useCallback(() => {
    setDraggedOperationId('')
    setDragOverOperationId('')
    setDragOverPosition('before')
  }, [])

  const handleDragStart = useCallback(
    (event: DragEvent, operationId: string) => {
      setDraggedOperationId(operationId)
      setSelectedOperationId(operationId)
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', operationId)
    },
    [setSelectedOperationId]
  )

  const handleDragOver = useCallback(
    (event: DragEvent, operationId: string) => {
      event.preventDefault()
      if (!draggedOperationId || draggedOperationId === operationId) return
      const rect = event.currentTarget.getBoundingClientRect()
      const position: 'before' | 'after' =
        event.clientY - rect.top > rect.height / 2 ? 'after' : 'before'
      setDragOverOperationId(operationId)
      setDragOverPosition(position)
      event.dataTransfer.dropEffect = 'move'
    },
    [draggedOperationId]
  )

  const handleDrop = useCallback(
    (event: DragEvent, operationId: string) => {
      event.preventDefault()
      const sourceId =
        draggedOperationId || event.dataTransfer.getData('text/plain')
      const position =
        dragOverOperationId === operationId ? dragOverPosition : 'before'
      if (sourceId && operationId && sourceId !== operationId) {
        setOperations((prev) =>
          reorderOperations(prev, sourceId, operationId, position)
        )
        setSelectedOperationId(sourceId)
      }
      resetDragState()
    },
    [
      draggedOperationId,
      dragOverOperationId,
      dragOverPosition,
      resetDragState,
      setSelectedOperationId,
      setOperations,
    ]
  )
  return {
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
  }
}
