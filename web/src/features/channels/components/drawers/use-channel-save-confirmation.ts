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
import { useCallback, useEffect, useRef, useState } from 'react'

import type { MissingModelsAction } from '../dialogs/missing-models-confirmation-dialog'

/**
 * Owns pending save decisions. Closing or switching the channel, replacing a
 * prompt, and unmounting all cancel unresolved decisions rather than saving.
 * Resolver refs stay private so every prompt is settled at most once.
 */
export function useChannelSaveConfirmation(
  open: boolean,
  channelId: number | null
) {
  const [statusCodeRiskOpen, setStatusCodeRiskOpen] = useState(false)
  const [statusCodeRiskDetailItems, setStatusCodeRiskDetailItems] = useState<
    string[]
  >([])
  const statusCodeRiskResolveRef = useRef<
    ((confirmed: boolean) => void) | null
  >(null)
  const [missingModelsDialogOpen, setMissingModelsOpen] = useState(false)
  const [missingModelsList, setMissingModelsList] = useState<string[]>([])
  const missingModelsResolveRef = useRef<
    ((action: MissingModelsAction) => void) | null
  >(null)

  const handleMissingModelsAction = useCallback(
    (action: MissingModelsAction) => {
      const resolve = missingModelsResolveRef.current
      missingModelsResolveRef.current = null
      setMissingModelsOpen(false)
      setMissingModelsList([])
      resolve?.(action)
    },
    []
  )

  const handleStatusCodeRiskAction = useCallback((confirmed: boolean) => {
    const resolve = statusCodeRiskResolveRef.current
    statusCodeRiskResolveRef.current = null
    setStatusCodeRiskOpen(false)
    setStatusCodeRiskDetailItems([])
    resolve?.(confirmed)
  }, [])

  const confirmMissingModelMappings = useCallback((models: string[]) => {
    missingModelsResolveRef.current?.('cancel')
    return new Promise<MissingModelsAction>((resolve) => {
      missingModelsResolveRef.current = resolve
      setMissingModelsList(models)
      setMissingModelsOpen(true)
    })
  }, [])

  const confirmStatusCodeRisk = useCallback((items: string[]) => {
    statusCodeRiskResolveRef.current?.(false)
    return new Promise<boolean>((resolve) => {
      statusCodeRiskResolveRef.current = resolve
      setStatusCodeRiskDetailItems(items)
      setStatusCodeRiskOpen(true)
    })
  }, [])

  const setMissingModelsDialogOpen = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) handleMissingModelsAction('cancel')
    },
    [handleMissingModelsAction]
  )

  useEffect(() => {
    handleMissingModelsAction('cancel')
    handleStatusCodeRiskAction(false)
    return () => {
      missingModelsResolveRef.current?.('cancel')
      missingModelsResolveRef.current = null
      statusCodeRiskResolveRef.current?.(false)
      statusCodeRiskResolveRef.current = null
    }
  }, [open, channelId, handleMissingModelsAction, handleStatusCodeRiskAction])

  return {
    statusCodeRiskOpen,
    statusCodeRiskDetailItems,
    missingModelsDialogOpen,
    missingModelsList,
    setMissingModelsDialogOpen,
    handleMissingModelsAction,
    handleStatusCodeRiskAction,
    confirmMissingModelMappings,
    confirmStatusCodeRisk,
  }
}
