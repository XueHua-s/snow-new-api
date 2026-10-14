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
import { Copy, Plus } from 'lucide-react'
import { memo, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { DataTableRow } from '../../../components/data-table/core/data-table-row'
import { DataTableView } from '../../../components/data-table/core/data-table-view'
import { DataTablePagination } from '../../../components/data-table/core/pagination'
import { DataTableBulkActions } from '../../../components/data-table/toolbar/bulk-actions'
import { DataTableToolbar } from '../../../components/data-table/toolbar/toolbar'
import {
  ModelPricingEditorPanel,
  ModelPricingSheet,
} from './model-pricing-sheet'
import { useModelRatioEditor } from './use-model-ratio-editor'

export type ModelRatioVisualEditorProps = {
  savedModelPrice: string
  savedModelRatio: string
  savedCacheRatio: string
  savedCreateCacheRatio: string
  savedCompletionRatio: string
  savedImageRatio: string
  savedAudioRatio: string
  savedAudioCompletionRatio: string
  savedBillingMode: string
  savedBillingExpr: string
  modelPrice: string
  modelRatio: string
  cacheRatio: string
  createCacheRatio: string
  completionRatio: string
  imageRatio: string
  audioRatio: string
  audioCompletionRatio: string
  billingMode: string
  billingExpr: string
  candidateModelNames?: string[]
  candidateModelsLoading?: boolean
  filterMode?: 'all' | 'unset'
  onChange: (field: string, value: string) => void
  onSave: () => void | Promise<void>
  isSaving: boolean
}

export type ModelRatioVisualEditorHandle = {
  commitOpenEditor: () => Promise<boolean>
}

const ModelRatioVisualEditorComponent = forwardRef<
  ModelRatioVisualEditorHandle,
  ModelRatioVisualEditorProps
>(function ModelRatioVisualEditorInner(
  {
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
    candidateModelNames,
    candidateModelsLoading,
    filterMode = 'all',
    onChange,
    onSave,
    isSaving,
  }: ModelRatioVisualEditorProps,
  ref: React.ForwardedRef<ModelRatioVisualEditorHandle>
) {
  const { t } = useTranslation()
  const {
    isMobile,
    sheetOpen,
    setSheetOpen,
    editorOpen,
    editData,
    editorPanelRef,
    modeCounts,
    handleEdit,
    handleAdd,
    table,
    handleBatchCopy,
    hasRows,
    emptyStateText,
  } = useModelRatioEditor(
    {
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
      candidateModelNames,
      candidateModelsLoading,
      filterMode,
      onChange,
      onSave,
      isSaving,
    },
    ref
  )
  return (
    <div className='flex flex-col gap-4'>
      <div className='grid h-[clamp(720px,calc(100vh-12rem),900px)] min-h-0 gap-4 md:grid-cols-[minmax(300px,0.72fr)_minmax(520px,1.28fr)] xl:grid-cols-[minmax(320px,0.68fr)_minmax(640px,1.32fr)]'>
        <div className='flex min-h-0 min-w-0 flex-col gap-3'>
          <DataTableToolbar
            table={table}
            searchPlaceholder={t('Search models...')}
            searchDebounceMs={250}
            filters={[
              {
                columnId: 'billingMode',
                title: t('Mode'),
                options: [
                  {
                    label: 'Per-token',
                    value: 'per-token',
                    count: modeCounts['per-token'],
                  },
                  {
                    label: 'Per-request',
                    value: 'per-request',
                    count: modeCounts['per-request'],
                  },
                  {
                    label: 'Expression',
                    value: 'tiered_expr',
                    count: modeCounts.tiered_expr,
                  },
                ],
              },
            ]}
            preActions={
              filterMode === 'unset' ? undefined : (
                <Button onClick={handleAdd}>
                  <Plus data-icon='inline-start' />
                  {t('Add model')}
                </Button>
              )
            }
          />

          {!hasRows ? (
            <div className='text-muted-foreground rounded-lg border border-dashed p-8 text-center'>
              {emptyStateText}
            </div>
          ) : (
            <DataTableView
              table={table}
              containerClassName='min-h-0 flex-1 rounded-md'
              tableContainerClassName='h-full'
              tableClassName='min-w-[852px] table-fixed'
              tableHeaderClassName='[&_tr]:border-b-0'
              splitHeaderScrollClassName='h-full'
              bodyContainerClassName='[scrollbar-gutter:stable]'
              splitHeader
              pinnedColumns={[
                {
                  columnId: 'actions',
                  side: 'right',
                },
              ]}
              colgroup={
                <colgroup>
                  <col className='w-9' />
                  <col className='w-[300px]' />
                  <col className='w-[120px]' />
                  <col className='w-[300px]' />
                  <col className='w-auto' />
                </colgroup>
              }
              renderRow={(row, { getCellClassName }) => (
                <DataTableRow
                  key={row.id}
                  row={row}
                  className={
                    editData?.name === row.original.name
                      ? 'bg-muted/45 hover:bg-muted/50 data-[state=selected]:bg-muted group'
                      : 'group'
                  }
                  getColumnClassName={(columnId) =>
                    columnId === 'actions' &&
                    editData?.name === row.original.name
                      ? getCellClassName(columnId, 'bg-muted')
                      : getCellClassName(columnId)
                  }
                  onClick={(event) => {
                    const target = event.target as HTMLElement
                    if (target.closest('button, [role="checkbox"]')) return
                    handleEdit(row.original)
                  }}
                />
              )}
            />
          )}

          {hasRows && <DataTablePagination table={table} />}
        </div>

        <div className='hidden min-h-0 min-w-0 md:block'>
          {editorOpen ? (
            <ModelPricingEditorPanel
              ref={editorPanelRef}
              editData={editData}
              onSave={onSave}
              isSaving={isSaving}
              className='h-full min-h-0'
            />
          ) : (
            <div className='bg-card text-muted-foreground flex h-full min-h-0 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center'>
              <div className='text-foreground text-base font-medium'>
                {t('Select a model to edit pricing')}
              </div>
              <p className='max-w-sm text-sm'>
                {t(
                  'Use the full-width table to scan prices, then select a row to edit it here.'
                )}
              </p>
              {filterMode !== 'unset' && (
                <Button variant='outline' onClick={handleAdd}>
                  <Plus data-icon='inline-start' />
                  {t('Add model')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <DataTableBulkActions table={table} entityName={t('model')}>
        <Button size='sm' disabled={!editData} onClick={handleBatchCopy}>
          <Copy data-icon='inline-start' />
          {editData
            ? t('Copy {{name}} pricing', { name: editData.name })
            : t('Open a source model first')}
        </Button>
      </DataTableBulkActions>

      {isMobile && (
        <ModelPricingSheet
          ref={editorPanelRef}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          editData={editData}
          onSave={onSave}
          isSaving={isSaving}
        />
      )}
    </div>
  )
})

export const ModelRatioVisualEditor = memo(
  ModelRatioVisualEditorComponent,
  // Custom equality check - only re-render if JSON props actually changed
  (prevProps, nextProps) => {
    return (
      prevProps.savedModelPrice === nextProps.savedModelPrice &&
      prevProps.savedModelRatio === nextProps.savedModelRatio &&
      prevProps.savedCacheRatio === nextProps.savedCacheRatio &&
      prevProps.savedCreateCacheRatio === nextProps.savedCreateCacheRatio &&
      prevProps.savedCompletionRatio === nextProps.savedCompletionRatio &&
      prevProps.savedImageRatio === nextProps.savedImageRatio &&
      prevProps.savedAudioRatio === nextProps.savedAudioRatio &&
      prevProps.savedAudioCompletionRatio ===
        nextProps.savedAudioCompletionRatio &&
      prevProps.savedBillingMode === nextProps.savedBillingMode &&
      prevProps.savedBillingExpr === nextProps.savedBillingExpr &&
      prevProps.modelPrice === nextProps.modelPrice &&
      prevProps.modelRatio === nextProps.modelRatio &&
      prevProps.cacheRatio === nextProps.cacheRatio &&
      prevProps.createCacheRatio === nextProps.createCacheRatio &&
      prevProps.completionRatio === nextProps.completionRatio &&
      prevProps.imageRatio === nextProps.imageRatio &&
      prevProps.audioRatio === nextProps.audioRatio &&
      prevProps.audioCompletionRatio === nextProps.audioCompletionRatio &&
      prevProps.billingMode === nextProps.billingMode &&
      prevProps.billingExpr === nextProps.billingExpr &&
      prevProps.candidateModelNames === nextProps.candidateModelNames &&
      prevProps.candidateModelsLoading === nextProps.candidateModelsLoading &&
      prevProps.filterMode === nextProps.filterMode &&
      prevProps.onChange === nextProps.onChange &&
      prevProps.onSave === nextProps.onSave &&
      prevProps.isSaving === nextProps.isSaving
    )
  }
)

export { STORAGE_KEY } from './model-ratio-storage'
