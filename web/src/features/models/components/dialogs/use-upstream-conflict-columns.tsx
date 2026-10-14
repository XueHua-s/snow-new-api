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
import type { ColumnDef } from '@tanstack/react-table'
import { MousePointerClick } from 'lucide-react'
import { useMemo } from 'react'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

import { formatValue } from './upstream-conflict-format'
import { ValuePreview } from './upstream-conflict-values'
import type { ConflictFieldRow } from './use-upstream-conflicts'

export function useUpstreamConflictColumns(isMobile: boolean) {
  const columns = useMemo<ColumnDef<ConflictFieldRow>[]>(() => {
    const modelColumn: ColumnDef<ConflictFieldRow> = {
      accessorKey: 'modelName',
      header: 'Model',
      cell: ({ row }) => (
        <div className='flex items-start gap-3'>
          {isMobile ? (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label='Select row'
            />
          ) : null}
          <div className='space-y-1'>
            <p className='leading-none font-medium'>{row.original.modelName}</p>
            <span className='text-muted-foreground font-mono text-xs'>
              {row.original.fieldKey}
            </span>
            {isMobile ? (
              <StatusBadge
                label={row.original.fieldLabel}
                variant='neutral'
                size='sm'
                copyable={false}
              />
            ) : null}
          </div>
        </div>
      ),
      size: 220,
    }

    const diffColumn: ColumnDef<ConflictFieldRow> = {
      id: 'actions',
      header: 'Diff',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant='ghost'
                size='sm'
                className={isMobile ? 'h-7 w-7 p-0' : 'h-7 gap-2 px-2 text-xs'}
              />
            }
          >
            <MousePointerClick className='h-3.5 w-3.5' />
            {!isMobile && 'View diff'}
          </PopoverTrigger>
          <PopoverContent className='w-[min(90vw,24rem)] space-y-4 text-sm'>
            <div>
              <StatusBadge
                label='Local'
                variant='neutral'
                size='sm'
                copyable={false}
                className='mb-1'
              />
              <pre className='bg-muted rounded-md p-2 text-xs'>
                {formatValue(row.original.localValue)}
              </pre>
            </div>
            <div>
              <StatusBadge
                label='Upstream'
                variant='info'
                size='sm'
                copyable={false}
                className='mb-1'
              />
              <pre className='bg-muted rounded-md p-2 text-xs'>
                {formatValue(row.original.upstreamValue)}
              </pre>
            </div>
          </PopoverContent>
        </Popover>
      ),
      size: isMobile ? 50 : 140,
    }

    if (isMobile) {
      return [modelColumn, diffColumn]
    }

    const selectionColumn: ColumnDef<ConflictFieldRow> = {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label='Select row'
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    }

    return [
      selectionColumn,
      modelColumn,
      {
        accessorKey: 'fieldLabel',
        header: 'Field',
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.fieldLabel}
            variant='neutral'
            size='sm'
            copyable={false}
          />
        ),
        enableSorting: false,
        size: 160,
      },
      {
        accessorKey: 'localValue',
        header: 'Local Value',
        cell: ({ row }) => <ValuePreview value={row.original.localValue} />,
      },
      {
        accessorKey: 'upstreamValue',
        header: 'Upstream Value',
        cell: ({ row }) => <ValuePreview value={row.original.upstreamValue} />,
      },
    ]
  }, [isMobile])
  return { columns }
}
