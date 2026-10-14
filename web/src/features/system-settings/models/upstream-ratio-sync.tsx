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
import { CheckSquare, RefreshCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { ChannelSelectorDialog } from './channel-selector-dialog'
import { ConflictConfirmDialog } from './conflict-confirm-dialog'
import { UpstreamRatioSyncTable } from './upstream-ratio-sync-table'
import {
  type UpstreamRatioSyncProps,
  useUpstreamRatioSync,
} from './use-upstream-ratio-sync'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UpstreamRatioSync({ modelRatios }: UpstreamRatioSyncProps) {
  const { t } = useTranslation()
  const {
    channelDialogOpen,
    setChannelDialogOpen,
    conflictDialogOpen,
    setConflictDialogOpen,
    selectedChannelIds,
    setSelectedChannelIds,
    channelEndpoints,
    setChannelEndpoints,
    differences,
    resolutions,
    conflictItems,
    confirmLoading,
    channels,
    fetchMutation,
    isSyncPending,
    handleOpenChannelDialog,
    handleConfirmChannelSelection,
    handleSelectValue,
    handleSelectValues,
    handleUnselectValue,
    handleUnselectValues,
    handleApplySync,
    handleConfirmConflict,
    hasSelections,
    isLoading,
  } = useUpstreamRatioSync({ modelRatios })
  return (
    <div className='flex h-full min-h-0 flex-col gap-4'>
      <div className='flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <Button onClick={handleOpenChannelDialog} disabled={isLoading}>
            <RefreshCcw className='mr-2 h-4 w-4' />
            {t('Select Sync Channels')}
          </Button>
          <Button
            variant='secondary'
            onClick={handleApplySync}
            disabled={!hasSelections || isLoading}
          >
            {(isSyncPending || confirmLoading) && (
              <span className='mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
            )}
            <CheckSquare className='mr-2 h-4 w-4' />
            {t('Apply Sync')}
          </Button>
        </div>
      </div>

      <div className='min-h-0 flex-1'>
        <UpstreamRatioSyncTable
          differences={differences}
          resolutions={resolutions}
          isDisabled={isLoading}
          isSyncing={fetchMutation.isPending}
          onSelectValue={handleSelectValue}
          onSelectValues={handleSelectValues}
          onUnselectValue={handleUnselectValue}
          onUnselectValues={handleUnselectValues}
        />
      </div>

      <ChannelSelectorDialog
        open={channelDialogOpen}
        onOpenChange={setChannelDialogOpen}
        channels={channels}
        selectedChannelIds={selectedChannelIds}
        onSelectedChannelIdsChange={setSelectedChannelIds}
        channelEndpoints={channelEndpoints}
        onChannelEndpointsChange={setChannelEndpoints}
        onConfirm={handleConfirmChannelSelection}
      />

      <ConflictConfirmDialog
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        conflicts={conflictItems}
        onConfirm={handleConfirmConflict}
        isLoading={confirmLoading}
      />
    </div>
  )
}
