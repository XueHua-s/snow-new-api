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
/* eslint-disable react-refresh/only-export-components */

import type { ColumnDef } from '@tanstack/react-table'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { GroupBadge } from '@/components/group-badge'
import { StatusBadge } from '@/components/status-badge'
import { TableId } from '@/components/table-id'
import { TruncatedText } from '@/components/truncated-text'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'
import { formatTimestampToDate } from '@/lib/format'
import { truncateText } from '@/lib/utils'

import { BadgeListCell } from '../../../components/data-table/core/badge-list-cell'
import {
  formatRelativeTime,
  formatResponseTime,
  getResponseTimeConfig,
  parseModelsList,
  parseGroupsList,
  parseChannelSettings,
  isTagAggregateRow,
  type TagRow,
} from '../lib'
import type { Channel } from '../types'
import { SENSITIVE_MASK, BalanceCell } from './channel-balance-cell'
import {
  UpstreamUpdateTags,
  PriorityCell,
  WeightCell,
} from './channel-routing-cells'
import { buildChannelStatusColumns } from './channel-status-columns'
import { useChannels } from './channels-provider'
import { DataTableRowActions } from './data-table-row-actions'
import { DataTableTagRowActions } from './data-table-tag-row-actions'

/**
 * Generate channels columns configuration
 */
export function useChannelsColumns(
  options: {
    enableSelection?: boolean
  } = {}
): ColumnDef<Channel>[] {
  const { t, i18n } = useTranslation()
  const { sensitiveVisible } = useChannels()
  const enableSelection = options.enableSelection ?? true
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  // The column definitions only depend on the translation function, the active
  // locale, and sensitive-data visibility. Memoizing keeps the array (and every
  // cell renderer reference) stable across unrelated re-renders, so react-table
  // does not invalidate the whole row model on each parent render.
  return useMemo<ColumnDef<Channel>[]>(
    () => [
      // Checkbox column
      ...(enableSelection
        ? [
            {
              id: 'select',
              header: ({ table }) => (
                <Checkbox
                  checked={table.getIsAllPageRowsSelected()}
                  indeterminate={table.getIsSomePageRowsSelected()}
                  onCheckedChange={(value) =>
                    table.toggleAllPageRowsSelected(!!value)
                  }
                  aria-label={t('Select all')}
                />
              ),
              cell: ({ row }) => {
                const isTagRow = isTagAggregateRow(row.original)

                // Don't show checkbox for tag rows
                if (isTagRow) {
                  return null
                }

                return (
                  <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label={t('Select row')}
                  />
                )
              },
              enableSorting: false,
              enableHiding: false,
              enableResizing: false,
              size: 40,
            } satisfies ColumnDef<Channel>,
          ]
        : []),

      // ID column
      {
        accessorKey: 'id',
        header: t('ID'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const id = row.getValue('id') as number
          return <TableId value={sensitiveVisible ? id : SENSITIVE_MASK} />
        },
        size: 80,
      },
      // Name column
      {
        accessorKey: 'name',
        header: t('Name'),
        meta: { mobileTitle: true },
        cell: ({ row }) => {
          const isTagRow = isTagAggregateRow(row.original)
          const name = row.getValue('name') as string
          const channel = row.original

          // Tag row with expand/collapse
          if (isTagRow) {
            const tag = (row.original as TagRow).tag || name
            const childrenCount = (row.original as TagRow).children?.length || 0

            return (
              <div className='flex items-center gap-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-6 w-6 p-0'
                  onClick={row.getToggleExpandedHandler()}
                >
                  {row.getIsExpanded() ? (
                    <ChevronDown className='h-4 w-4' />
                  ) : (
                    <ChevronRight className='h-4 w-4' />
                  )}
                </Button>
                <div className='flex items-center gap-1.5'>
                  <span className='font-semibold'>Tag：{tag}</span>
                  <StatusBadge
                    label={`${childrenCount} channels`}
                    variant='blue'
                    size='sm'
                    copyable={false}
                  />
                </div>
              </div>
            )
          }

          // Regular channel row
          const settings = parseChannelSettings(channel.setting)
          const isPassThrough = settings.pass_through_body_enabled === true
          const hasParamOverride = Boolean(channel.param_override?.trim())

          return (
            <div className='flex max-w-full min-w-0 items-center gap-2'>
              <div className='flex max-w-full min-w-0 flex-col gap-1'>
                <div className='flex max-w-full min-w-0 items-center gap-1.5'>
                  <TruncatedText
                    text={sensitiveVisible ? name : SENSITIVE_MASK}
                    className='font-medium'
                    maxWidth='max-w-full'
                  />
                  {isPassThrough && (
                    <TooltipProvider delay={100}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <AlertTriangle className='h-3.5 w-3.5 flex-shrink-0 text-amber-500' />
                          }
                        />
                        <TooltipContent side='top'>
                          {t(
                            'Request body pass-through is enabled. The request body will be sent directly to the upstream without any conversion.'
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {hasParamOverride && (
                    <TooltipProvider delay={100}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <SlidersHorizontal className='text-info h-3.5 w-3.5 flex-shrink-0' />
                          }
                        />
                        <TooltipContent side='top'>
                          {t('Override request parameters')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <UpstreamUpdateTags channel={channel} />
                </div>
                {channel.remark && (
                  <TooltipProvider delay={200}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className='text-muted-foreground text-xs' />
                        }
                      >
                        {truncateText(channel.remark, 40)}
                      </TooltipTrigger>
                      <TooltipContent side='bottom' className='max-w-xs'>
                        {channel.remark}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          )
        },
        size: 260,
        minSize: 200,
      },

      ...buildChannelStatusColumns(t),
      // Models column
      {
        accessorKey: 'models',
        header: t('Models'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const models = row.getValue('models') as string
          const modelArray = parseModelsList(models)
          return (
            <BadgeListCell
              items={modelArray.map((model) => (
                <StatusBadge
                  key={model}
                  label={model}
                  autoColor={model}
                  size='sm'
                  className='font-mono'
                />
              ))}
            />
          )
        },
        size: 200,
        enableSorting: false,
      },

      // Group column
      {
        accessorKey: 'group',
        header: t('Groups'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const group = row.getValue('group') as string
          const groupArray = parseGroupsList(group)
          return (
            <BadgeListCell
              items={groupArray.map((g) => (
                <GroupBadge
                  key={g}
                  group={g}
                  label={sensitiveVisible ? undefined : SENSITIVE_MASK}
                  size='sm'
                />
              ))}
            />
          )
        },
        filterFn: (row, id, value) => {
          if (!value || value.length === 0 || value.includes('all')) {
            return true
          }
          const group = row.getValue(id) as string
          const groupArray = parseGroupsList(group)
          return groupArray.some((g) => value.includes(g))
        },
        size: 150,
        enableSorting: false,
      },

      // Tag column
      {
        accessorKey: 'tag',
        header: t('Tag'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const tag = row.getValue('tag') as string | null
          if (!tag) {
            return <span className='text-muted-foreground text-xs'>-</span>
          }

          return (
            <StatusBadge
              label={tag}
              autoColor={tag}
              size='sm'
              className='-ml-1.5'
            />
          )
        },
        size: 120,
        enableSorting: false,
      },

      // Priority column
      {
        accessorKey: 'priority',
        header: t('Priority'),
        meta: { mobileHidden: true },
        cell: ({ row }) => <PriorityCell channel={row.original} />,
        size: 100,
      },

      // Weight column
      {
        accessorKey: 'weight',
        header: t('Weight'),
        meta: { mobileHidden: true },
        cell: ({ row }) => <WeightCell channel={row.original} />,
        size: 90,
        enableSorting: false,
      },

      // Balance column (Used/Remaining)
      {
        accessorKey: 'balance',
        header: t('Used / Remaining'),
        cell: ({ row }) => <BalanceCell channel={row.original} />,
        size: 180,
      },

      // Response Time column
      {
        accessorKey: 'response_time',
        header: t('Response'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const responseTime = row.getValue('response_time') as number
          const config = getResponseTimeConfig(responseTime)

          return (
            <StatusBadge
              label={formatResponseTime(responseTime, t)}
              variant={config.variant}
              size='sm'
              copyable={false}
              className='-ml-1.5'
            />
          )
        },
        size: 110,
      },

      // Test Time column
      {
        accessorKey: 'test_time',
        header: t('Last Tested'),
        meta: { mobileHidden: true },
        cell: ({ row }) => {
          const testTime = row.getValue('test_time') as number

          // For invalid timestamps, show "Never" badge
          if (!testTime || testTime === 0) {
            return <span className='text-muted-foreground text-xs'>-</span>
          }

          const timeText = formatRelativeTime(testTime, locale)
          const fullDate = formatTimestampToDate(testTime)

          // For valid timestamps, show tooltip with full date
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <StatusBadge
                      label={timeText}
                      variant='neutral'
                      size='sm'
                      copyable={false}
                      className='-ml-1.5 cursor-pointer'
                    />
                  }
                />
                <TooltipContent side='top'>
                  <p className='font-mono text-sm'>{fullDate}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
        size: 120,
        enableSorting: false,
      },

      // Actions column
      {
        id: 'actions',
        header: () => t('Actions'),
        cell: ({ row }) => {
          // Check if this is a tag row (has children)
          const isTagRow = isTagAggregateRow(row.original)

          if (isTagRow) {
            return (
              <DataTableTagRowActions
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                row={row as any}
              />
            )
          }

          return <DataTableRowActions row={row} />
        },
        enableSorting: false,
        enableHiding: false,
        meta: { pinned: 'right' as const },
      },
    ],
    [enableSelection, t, locale, sensitiveVisible]
  )
}

export { BalanceCell } from './channel-balance-cell'
