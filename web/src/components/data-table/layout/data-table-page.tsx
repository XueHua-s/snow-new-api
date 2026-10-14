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
import type { Row } from '@tanstack/react-table'
import * as React from 'react'

import { PageFooterPortal } from '@/components/layout/components/page-footer'
import { cn } from '@/lib/utils'

import { useMediaQuery } from '../../../hooks/use-media-query'
import { DataTableView } from '../core/data-table-view'
import { DataTablePagination } from '../core/pagination'
import {
  DATA_TABLE_VIEW_MODES,
  useDataTableViewMode,
  type DataTableViewMode,
} from '../hooks/use-data-table-view-mode'
import { DataTableToolbar } from '../toolbar/toolbar'
import { DataTableViewModeToggle } from '../toolbar/view-mode-toggle'
import { DataTableCardGrid } from './card-grid'
import type { DataTablePageProps } from './data-table-page-types'
import { MobileCardList } from './mobile-card-list'

/**
 * Unified table page wrapper. Encapsulates the canonical structure used across
 * all list pages: toolbar → desktop table / mobile list → pagination, plus
 * loading/empty states and an opt-in bulk action bar.
 *
 * Most pages should be expressible as:
 * ```tsx
 * <DataTablePage
 *   table={table}
 *   columns={columns}
 *   isLoading={isLoading}
 *   isFetching={isFetching}
 *   emptyTitle={t('No X Found')}
 *   toolbarProps={{ searchPlaceholder: t('Filter...'), filters }}
 *   bulkActions={<MyBulkActions table={table} />}
 * />
 * ```
 *
 * For complex layouts (custom mobile, expanded rows, custom toolbar), use the
 * `toolbar` / `mobile` / `renderRow` slots instead of the `*Props` variants.
 */
export function DataTablePage<TData>(props: DataTablePageProps<TData>) {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const showMobile = isMobile && !props.hideMobile

  const [internalViewMode, setInternalViewMode] = useDataTableViewMode({
    storageKey: props.viewModeStorageKey,
    // When card view is enabled, prefer it as the default unless the consumer
    // explicitly opts into a different initial mode. A persisted choice (via
    // `viewModeStorageKey`) still takes precedence over this default.
    defaultMode:
      props.defaultViewMode ??
      (props.enableCardView ? DATA_TABLE_VIEW_MODES.CARD : undefined),
  })
  const viewMode = props.viewMode ?? internalViewMode
  const setViewMode = props.onViewModeChange ?? setInternalViewMode
  const cardViewActive = !!props.enableCardView

  const viewToggle = cardViewActive ? (
    <DataTableViewModeToggle value={viewMode} onChange={setViewMode} />
  ) : undefined

  const toolbarNode = renderToolbar(props, viewToggle)
  const mobileNode = renderMobile(props, showMobile, cardViewActive, viewMode)
  const desktopNode = renderDesktop(props, showMobile, cardViewActive, viewMode)
  const paginationNode = renderPagination(props)

  return (
    <>
      <div
        className={cn(
          props.fixedHeight !== false
            ? 'flex h-full min-h-0 flex-col gap-2.5 sm:gap-3'
            : 'space-y-2.5 sm:space-y-3',
          props.className
        )}
      >
        {toolbarNode}
        {mobileNode}
        {desktopNode}
        {props.afterTable}
      </div>

      {/* Bulk actions are typically a fixed-position toolbar; let the consumer
          handle its own visibility, we just gate it to non-mobile. */}
      {!showMobile && props.bulkActions}

      {paginationNode}
    </>
  )
}

function renderToolbar<TData>(
  props: DataTablePageProps<TData>,
  viewToggle: React.ReactNode
): React.ReactNode {
  if (props.toolbar !== undefined) {
    // Fully custom toolbar: the consumer owns layout, including any toggle.
    return props.toolbar
  }
  if (props.toolbarProps === null) {
    return null
  }
  if (props.toolbarProps) {
    return (
      <DataTableToolbar
        table={props.table}
        {...props.toolbarProps}
        viewToggle={props.toolbarProps.viewToggle ?? viewToggle}
      />
    )
  }
  return null
}

function renderPagination<TData>(
  props: DataTablePageProps<TData>
): React.ReactNode {
  if (props.showPagination === false) {
    return null
  }

  const pagination = <DataTablePagination table={props.table} />

  return props.paginationInFooter !== false ? (
    <PageFooterPortal>{pagination}</PageFooterPortal>
  ) : (
    <div className='pt-2'>{pagination}</div>
  )
}

function renderMobile<TData>(
  props: DataTablePageProps<TData>,
  showMobile: boolean,
  cardViewActive: boolean,
  viewMode: DataTableViewMode
): React.ReactNode {
  if (!showMobile) {
    return null
  }

  const isFetchingOnly = props.isFetching && !props.isLoading
  const ownGetRowClassName = props.getRowClassName
  const mobileGetRowClassName =
    props.mobileProps?.getRowClassName ??
    (ownGetRowClassName
      ? (row: Row<TData>) => ownGetRowClassName(row, { isMobile: true })
      : undefined)

  let mobileContent = props.mobile
  if (mobileContent === undefined) {
    if (cardViewActive && viewMode === DATA_TABLE_VIEW_MODES.TABLE) {
      mobileContent = (
        <DataTableView
          table={props.table}
          isLoading={props.isLoading}
          emptyTitle={props.emptyTitle}
          emptyDescription={props.emptyDescription}
          emptyIcon={props.emptyIcon}
          emptyAction={props.emptyAction}
          skeletonKeyPrefix={props.skeletonKeyPrefix}
          renderRow={props.renderRow}
          applyHeaderSize={props.applyHeaderSize}
          tableHeaderClassName={cn(
            '[background-color:var(--table-header)]',
            props.tableHeaderClassName
          )}
          getColumnClassName={props.getColumnClassName}
          pinnedColumns={props.pinnedColumns}
          containerClassName={cn(
            'transition-opacity duration-150',
            isFetchingOnly && 'pointer-events-none opacity-60',
            props.tableClassName
          )}
          getRowClassName={(row) =>
            props.getRowClassName?.(row, { isMobile: false })
          }
        />
      )
    } else if (cardViewActive) {
      mobileContent = (
        <DataTableCardGrid
          table={props.table}
          isLoading={props.isLoading}
          emptyTitle={props.emptyTitle}
          emptyDescription={props.emptyDescription}
          emptyIcon={props.emptyIcon}
          renderCard={props.renderCard}
          gridClassName={props.cardGridClassName ?? 'grid grid-cols-1 gap-3'}
          skeletonKeyPrefix={props.skeletonKeyPrefix}
          getRowKey={props.mobileProps?.getRowKey}
          getRowClassName={mobileGetRowClassName}
        />
      )
    } else {
      mobileContent = (
        <MobileCardList
          table={props.table}
          isLoading={props.isLoading}
          emptyTitle={props.emptyTitle}
          emptyDescription={props.emptyDescription}
          getRowKey={props.mobileProps?.getRowKey}
          getRowClassName={mobileGetRowClassName}
        />
      )
    }
  }

  return <div className='min-h-0 flex-1 overflow-y-auto'>{mobileContent}</div>
}

function renderDesktop<TData>(
  props: DataTablePageProps<TData>,
  showMobile: boolean,
  cardViewActive: boolean,
  viewMode: DataTableViewMode
): React.ReactNode {
  if (showMobile) {
    return null
  }

  const isFetchingOnly = props.isFetching && !props.isLoading
  const fixedHeight = props.fixedHeight !== false

  if (cardViewActive && viewMode === DATA_TABLE_VIEW_MODES.CARD) {
    return (
      <div
        className={cn(
          fixedHeight && 'min-h-0 flex-1 overflow-y-auto',
          'transition-opacity duration-150',
          isFetchingOnly && 'pointer-events-none opacity-60'
        )}
      >
        <DataTableCardGrid
          table={props.table}
          isLoading={props.isLoading}
          emptyTitle={props.emptyTitle}
          emptyDescription={props.emptyDescription}
          emptyIcon={props.emptyIcon}
          renderCard={props.renderCard}
          gridClassName={props.cardGridClassName}
          skeletonKeyPrefix={props.skeletonKeyPrefix}
          getRowClassName={(row) =>
            props.getRowClassName?.(row, { isMobile: false })
          }
        />
      </div>
    )
  }

  return (
    <DataTableView
      table={props.table}
      isLoading={props.isLoading}
      emptyTitle={props.emptyTitle}
      emptyDescription={props.emptyDescription}
      emptyIcon={props.emptyIcon}
      emptyAction={props.emptyAction}
      skeletonKeyPrefix={props.skeletonKeyPrefix}
      renderRow={props.renderRow}
      applyHeaderSize={props.applyHeaderSize}
      splitHeader={fixedHeight}
      tableContainerClassName={fixedHeight ? 'h-full min-h-0' : undefined}
      tableHeaderClassName={cn(
        fixedHeight && '[background-color:var(--table-header)]',
        props.tableHeaderClassName
      )}
      getColumnClassName={props.getColumnClassName}
      pinnedColumns={props.pinnedColumns}
      containerClassName={cn(
        fixedHeight && 'min-h-0 flex-1',
        'transition-opacity duration-150',
        isFetchingOnly && 'pointer-events-none opacity-60',
        props.tableClassName
      )}
      getRowClassName={(row) =>
        props.getRowClassName?.(row, { isMobile: false })
      }
    />
  )
}

export {
  type DataTablePageToolbarProps,
  type DataTablePageProps,
} from './data-table-page-types'
