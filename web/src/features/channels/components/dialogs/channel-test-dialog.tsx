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
import { CheckCircle2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import { DataTableView } from '../../../../components/data-table/core/data-table-view'
import { DataTablePagination } from '../../../../components/data-table/core/pagination'
import { useChannels } from '../channels-provider'
import {
  endpointSelectContentClass,
  endpointSelectItemClass,
  getTestTableColumnClass,
} from './channel-test-data'
import {
  TestModelsBulkActions,
  FailureDetailsSheet,
} from './channel-test-results'
import {
  type ChannelTestDialogContentProps,
  useChannelTest,
} from './use-channel-test'

export type ChannelTestDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChannelTestDialog({
  open,
  onOpenChange,
}: ChannelTestDialogProps) {
  const { currentRow } = useChannels()

  if (!currentRow) {
    return null
  }

  return (
    <ChannelTestDialogContent
      key={currentRow.id}
      open={open}
      onOpenChange={onOpenChange}
      currentRow={currentRow}
    />
  )
}

function ChannelTestDialogContent({
  open,
  onOpenChange,
  currentRow,
}: ChannelTestDialogContentProps) {
  const { t } = useTranslation()
  const {
    endpointType,
    setIsStreamTest,
    searchTerm,
    isBatchTesting,
    isBatchStopRequested,
    isDeleteFailedDialogOpen,
    setIsDeleteFailedDialogOpen,
    isDeletingFailed,
    failureDetails,
    setFailureDetails,
    endpointSelectItems,
    streamDisabled,
    effectiveStreamTest,
    handleEndpointTypeChange,
    handleSearchTermChange,
    models,
    successModels,
    failedModels,
    filteredModels,
    handleStopBatchTest,
    handleBatchTest,
    handleSelectSuccessfulModels,
    handleDeleteFailedModels,
    handleClose,
    handleDialogOpenChange,
    isAnyTesting,
    testAllButtonLabel,
    table,
  } = useChannelTest({ open, onOpenChange, currentRow })
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={handleDialogOpenChange}
        title={
          <span className='inline-flex max-w-full min-w-0 items-center gap-1.5'>
            <span className='shrink-0'>{t('Test Channel Connection')}:</span>
            <span className='min-w-0 truncate'>{currentRow.name}</span>
          </span>
        }
        contentClassName='max-h-[90vh] overflow-hidden sm:max-w-4xl'
        contentHeight='auto'
        bodyClassName='space-y-4'
        footer={
          <Button variant='outline' onClick={handleClose}>
            {t('Close')}
          </Button>
        }
      >
        <div className='max-h-[78vh] space-y-4 overflow-y-auto py-4 pr-1'>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='endpoint-type'>{t('Endpoint Type')}</Label>
              <Select
                items={endpointSelectItems}
                value={endpointType}
                onValueChange={handleEndpointTypeChange}
              >
                <SelectTrigger id='endpoint-type' className='w-full min-w-0'>
                  <SelectValue
                    className='min-w-0 truncate'
                    placeholder={t('Auto detect (default)')}
                  />
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  className={endpointSelectContentClass}
                >
                  <SelectGroup>
                    {endpointSelectItems.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className={endpointSelectItemClass}
                      >
                        <span className='min-w-0 leading-snug break-words whitespace-normal'>
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Override the endpoint used for testing. Leave empty to auto detect.'
                )}
              </p>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='stream-toggle'>{t('Stream Mode')}</Label>
              <div className='flex items-center gap-2'>
                <Switch
                  id='stream-toggle'
                  checked={effectiveStreamTest}
                  onCheckedChange={setIsStreamTest}
                  disabled={streamDisabled}
                />
                <span className='text-sm'>
                  {effectiveStreamTest ? t('Enabled') : t('Disabled')}
                </span>
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('Enable streaming mode for the test request.')}
              </p>
            </div>
          </div>

          <div className='space-y-3 max-sm:has-[div[role="toolbar"]]:pb-16'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
              <div className='min-w-0 space-y-2'>
                <p className='text-sm font-medium'>{t('Channel models')}</p>
                <p className='text-muted-foreground text-xs'>
                  {t('Select models to run batch tests.')}
                </p>
                <div className='flex flex-wrap items-center gap-2'>
                  {isBatchTesting ? (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={handleStopBatchTest}
                      disabled={isBatchStopRequested}
                    >
                      {isBatchStopRequested
                        ? t('Stopping...')
                        : t('Stop testing')}
                    </Button>
                  ) : (
                    <>
                      <Button
                        size='sm'
                        onClick={() => handleBatchTest(filteredModels)}
                        disabled={isAnyTesting || filteredModels.length === 0}
                      >
                        {testAllButtonLabel}
                      </Button>
                      {successModels.length > 0 && (
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={handleSelectSuccessfulModels}
                        >
                          <CheckCircle2 data-icon='inline-start' />
                          {t('Select successful models ({{count}})', {
                            count: successModels.length,
                          })}
                        </Button>
                      )}
                      {failedModels.length > 0 && (
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => setIsDeleteFailedDialogOpen(true)}
                        >
                          <Trash2 data-icon='inline-start' />
                          {t('Delete failed models ({{count}})', {
                            count: failedModels.length,
                          })}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
                <Input
                  placeholder={t('Filter models...')}
                  value={searchTerm}
                  onChange={handleSearchTermChange}
                  className='sm:w-64'
                />
              </div>
            </div>

            <div className='space-y-3'>
              <DataTableView
                table={table}
                containerClassName='rounded-md'
                containerProps={{
                  role: 'region',
                  'aria-label': t('Channel models'),
                }}
                tableContainerClassName='max-h-90 overflow-auto **:data-[slot=table-container]:overflow-visible'
                tableClassName='w-max min-w-full table-auto'
                pinnedColumns={[
                  {
                    columnId: 'actions',
                    side: 'right',
                    cellClassName: 'bg-popover',
                  },
                ]}
                colgroup={
                  <colgroup>
                    <col className='w-10 min-w-10' />
                    <col className='w-auto' />
                    <col className='w-28' />
                    <col className='w-80' />
                    <col className='w-px' />
                  </colgroup>
                }
                getColumnClassName={(columnId) =>
                  getTestTableColumnClass(columnId)
                }
                emptyContent={
                  models.length
                    ? t('No models matched your search.')
                    : t('This channel has no configured models.')
                }
                emptyCellClassName='text-muted-foreground h-16 text-center text-sm'
              />

              <DataTablePagination table={table} />
            </div>

            <TestModelsBulkActions table={table} />
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={isDeleteFailedDialogOpen}
        onOpenChange={setIsDeleteFailedDialogOpen}
        title={t('Delete failed models')}
        desc={t(
          'This removes {{count}} failed models from this channel. This action cannot be undone.',
          { count: failedModels.length }
        )}
        destructive
        isLoading={isDeletingFailed}
        confirmText={t('Delete')}
        handleConfirm={handleDeleteFailedModels}
      />
      <FailureDetailsSheet
        details={failureDetails}
        onOpenChange={(sheetOpen) => {
          if (!sheetOpen) {
            setFailureDetails(null)
          }
        }}
      />
    </>
  )
}
