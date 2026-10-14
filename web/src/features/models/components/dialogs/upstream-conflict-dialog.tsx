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
import { Search, Info, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { DataTableView } from '../../../../components/data-table/core/data-table-view'
import { useDataTable } from '../../../../components/data-table/hooks/use-data-table'
import { applyUpstreamOverwrite } from '../../api'
import { modelsQueryKeys, vendorsQueryKeys } from '../../lib'
import type { SyncOverwritePayload } from '../../types'
import { PAGE_SIZE_OPTIONS } from './upstream-conflict-format'
import { useUpstreamConflictColumns } from './use-upstream-conflict-columns'
import {
  type UpstreamConflictDialogProps,
  useUpstreamConflicts,
} from './use-upstream-conflicts'

export function UpstreamConflictDialog({
  open,
  onOpenChange,
}: UpstreamConflictDialogProps) {
  const { t } = useTranslation()
  const {
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
  } = useUpstreamConflicts({ open, onOpenChange })
  const { columns } = useUpstreamConflictColumns(isMobile)

  const { table } = useDataTable({
    data: conflictRows,
    columns,
    rowSelection,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    withFilteredRowModel: false,
    withPaginationRowModel: false,
    withSortedRowModel: false,
    withFacetedRowModel: false,
  })

  const totalSelectedFields = table.getSelectedRowModel().rows.length
  const hasSelection = totalSelectedFields > 0
  const allRows = table.getRowModel().rows
  const filteredRows = visibleRowIds
    ? allRows.filter((row) => visibleRowIds.has(row.id))
    : allRows

  const totalFilteredFields = filteredRows.length
  const totalPages =
    totalFilteredFields === 0 ? 1 : Math.ceil(totalFilteredFields / pageSize)

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, Math.max(0, totalPages - 1)))
  }, [totalPages, setPageIndex])

  const pageStart = pageIndex * pageSize
  const paginatedRows = filteredRows.slice(pageStart, pageStart + pageSize)
  const displayStart = totalFilteredFields === 0 ? 0 : pageStart + 1
  const displayEnd =
    totalFilteredFields === 0
      ? 0
      : Math.min(pageStart + pageSize, totalFilteredFields)
  const currentPageDisplay = totalFilteredFields === 0 ? 0 : pageIndex + 1
  const totalPagesDisplay = totalFilteredFields === 0 ? 0 : totalPages

  const visibleModelCount = matchingModelNames?.size ?? totalModels
  const visibleFieldCount = totalFilteredFields
  const hasConflicts = totalFields > 0
  const showSearchEmptyState = hasConflicts && totalFilteredFields === 0

  const clearSelections = useCallback(() => {
    setRowSelection({})
  }, [setRowSelection])

  const handleApplyOverwrite = async () => {
    const selectedRows = table.getSelectedRowModel().rows
    const groupedSelections = selectedRows.reduce<Record<string, Set<string>>>(
      (acc, row) => {
        const key = row.original.modelName
        if (!acc[key]) {
          acc[key] = new Set()
        }
        acc[key].add(row.original.fieldKey)
        return acc
      },
      {}
    )

    const payload: SyncOverwritePayload[] = Object.entries(groupedSelections)
      .map(([modelName, fields]) => ({
        model_name: modelName,
        fields: [...fields],
      }))
      .filter((item) => item.fields.length > 0)

    if (payload.length === 0) {
      toast.warning(t('Select at least one field to overwrite.'))
      return
    }

    setIsSubmitting(true)
    try {
      const response = await applyUpstreamOverwrite({
        overwrite: payload,
        locale: syncWizardOptions.locale,
        source: syncWizardOptions.source,
      })

      if (response.success) {
        toast.success(t('Selected conflicts were overwritten successfully.'))
        queryClient.invalidateQueries({ queryKey: modelsQueryKeys.lists() })
        queryClient.invalidateQueries({ queryKey: vendorsQueryKeys.lists() })
        setUpstreamConflicts([])
        onOpenChange(false)
      } else {
        toast.error(response.message || t('Failed to apply overwrite.'))
      }
    } catch (error: unknown) {
      toast.error((error as Error)?.message || t('Failed to apply overwrite.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setUpstreamConflicts([])
        }
        onOpenChange(nextOpen)
      }}
      title={t('Resolve Conflicts')}
      description={t(
        'Select the fields you want to overwrite with upstream data. Unselected fields keep their local values.'
      )}
      contentClassName='w-full sm:max-w-5xl'
      contentHeight='min(72vh, 720px)'
      bodyClassName='flex flex-col gap-4'
      initialFocus={!isMobile}
      footerClassName='sm:justify-between'
      footer={
        <div className='flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='text-muted-foreground flex flex-1 items-start gap-2 text-xs'>
            <Info className='h-4 w-4 flex-shrink-0' />
            <span>
              {t(
                'Only selected fields will be overwritten. You can re-run the sync wizard if new conflicts appear.'
              )}
            </span>
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:justify-end'>
            <Button
              variant='outline'
              onClick={() => {
                setUpstreamConflicts([])
                onOpenChange(false)
              }}
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={handleApplyOverwrite}
              disabled={isSubmitting || !hasSelection}
            >
              {isSubmitting ? t('Applying...') : t('Apply Overwrite')}
            </Button>
          </div>
        </div>
      }
    >
      <div className='flex min-h-0 flex-1 flex-col gap-4'>
        {!hasConflicts ? (
          <div className='text-muted-foreground flex flex-1 items-center justify-center rounded-md border border-dashed p-8 text-center text-sm'>
            {t('No conflict entries available.')}
          </div>
        ) : (
          <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='space-y-1'>
                <div className='text-sm font-medium'>
                  {visibleModelCount} {t('model')}
                  {visibleModelCount === 1 ? '' : 's'} {t('with conflicts')}
                </div>
                <div className='text-muted-foreground text-xs'>
                  {visibleFieldCount} {t('field')}
                  {visibleFieldCount === 1 ? '' : 's'} {t('showing •')}{' '}
                  {totalSelectedFields} {t('selected')}
                </div>
              </div>
              <div className='flex w-full flex-col gap-2 sm:w-auto sm:flex-row'>
                <div className='relative flex-1'>
                  <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
                  <Input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setPageIndex(0)
                    }}
                    placeholder={t('Search models or fields...')}
                    className='pl-9'
                    aria-label={t('Search conflicting models or fields')}
                  />
                </div>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={clearSelections}
                  disabled={!hasSelection}
                >
                  {t('Clear selection')}
                </Button>
              </div>
            </div>

            {showSearchEmptyState ? (
              <div className='text-muted-foreground flex flex-1 items-center justify-center rounded-md border border-dashed p-8 text-center text-sm'>
                {t('No conflicts match your search.')}
              </div>
            ) : (
              <div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border'>
                <div className='flex-1 overflow-auto'>
                  <DataTableView
                    table={table}
                    rows={paginatedRows}
                    containerClassName='border-0'
                    tableContainerClassName={
                      isMobile ? 'min-w-full' : 'min-w-[720px]'
                    }
                  />
                </div>

                <div className='bg-muted/40 flex flex-col gap-2 border-t px-2 py-1.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-3 sm:py-2'>
                  <div className='text-muted-foreground text-xs'>
                    {t('Showing')} {displayStart}-{displayEnd} {t('of')}{' '}
                    {visibleFieldCount} {t('field')}
                    {visibleFieldCount === 1 ? '' : 's'}
                  </div>
                  <div className='flex items-center justify-between gap-2 sm:flex-wrap sm:gap-3'>
                    <div className='flex items-center gap-1.5 text-xs sm:gap-2'>
                      <span className='hidden sm:inline'>
                        {t('Rows per page')}
                      </span>
                      <Select
                        items={PAGE_SIZE_OPTIONS.map((size) => ({
                          value: String(size),
                          label: size,
                        }))}
                        value={String(pageSize)}
                        onValueChange={(value) => {
                          setPageSize(Number(value))
                          setPageIndex(0)
                        }}
                      >
                        <SelectTrigger className='h-8 w-[70px] text-xs sm:h-8 sm:w-[72px]'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {PAGE_SIZE_OPTIONS.map((size) => (
                              <SelectItem key={size} value={String(size)}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='flex items-center gap-1'>
                      <Button
                        variant='outline'
                        size='icon'
                        className='h-7 w-7 sm:h-8 sm:w-8'
                        onClick={() =>
                          setPageIndex((prev) => Math.max(0, prev - 1))
                        }
                        disabled={pageIndex === 0}
                        aria-label={t('Previous page')}
                      >
                        <ChevronLeft className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
                      </Button>
                      <span className='text-xs font-medium'>
                        {t('Page {{current}} of {{total}}', {
                          current: currentPageDisplay,
                          total: totalPagesDisplay,
                        })}
                      </span>
                      <Button
                        variant='outline'
                        size='icon'
                        className='h-7 w-7 sm:h-8 sm:w-8'
                        onClick={() =>
                          setPageIndex((prev) =>
                            Math.min(totalPages - 1, prev + 1)
                          )
                        }
                        disabled={
                          pageIndex >= totalPages - 1 ||
                          totalFilteredFields === 0
                        }
                        aria-label={t('Next page')}
                      >
                        <ChevronRight className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
