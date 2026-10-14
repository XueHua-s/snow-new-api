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
import { ListOrdered, Shuffle } from 'lucide-react'
import type { useTranslation } from 'react-i18next'

import { ProviderBadge } from '@/components/provider-badge'
import { StatusBadge } from '@/components/status-badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatTimestampToDate } from '@/lib/format'

import { CHANNEL_STATUS_CONFIG } from '../constants'
import {
  getChannelTypeIcon,
  getChannelTypeLabel,
  isMultiKeyChannel,
  isTagAggregateRow,
  type TagRow,
} from '../lib'
import type { Channel } from '../types'
import { parseIonetMeta } from './channel-balance-cell'

export function buildChannelStatusColumns(
  t: ReturnType<typeof useTranslation>['t']
): ColumnDef<Channel>[] {
  return [
    // Type column
    {
      accessorKey: 'type',
      header: t('Type'),
      cell: ({ row }) => {
        const isTagRow = isTagAggregateRow(row.original)

        if (isTagRow) {
          return (
            <StatusBadge
              label={t('Tag Aggregate')}
              variant='blue'
              size='sm'
              copyable={false}
              className='-ml-1.5'
            />
          )
        }

        const type = row.getValue('type') as number
        const typeNameKey = getChannelTypeLabel(type)
        const typeName = t(typeNameKey)
        const iconName = getChannelTypeIcon(type)
        const channel = row.original as Channel
        const isMultiKey = isMultiKeyChannel(channel)
        const multiKeyMode = channel.channel_info?.multi_key_mode ?? 'random'
        const MultiKeyModeIcon =
          multiKeyMode === 'random' ? Shuffle : ListOrdered
        const multiKeyTooltip =
          multiKeyMode === 'random'
            ? t('Multi-key: Random rotation')
            : t('Multi-key: Polling rotation')

        const ionetMeta = parseIonetMeta(channel.other_info)
        const isIonet = ionetMeta?.source === 'ionet'
        const deploymentId =
          typeof ionetMeta?.deployment_id === 'string'
            ? ionetMeta?.deployment_id
            : undefined

        return (
          <div className='flex max-w-full min-w-0 items-center gap-2 overflow-hidden'>
            {isMultiKey && (
              <TooltipProvider delay={100}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className='border-border bg-muted text-primary inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border' />
                    }
                  >
                    <MultiKeyModeIcon className='h-3 w-3' />
                  </TooltipTrigger>
                  <TooltipContent side='top'>{multiKeyTooltip}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider delay={300}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className='max-w-full min-w-0 overflow-hidden' />
                  }
                >
                  <ProviderBadge
                    iconKey={`${iconName}.Color`}
                    iconSize={18}
                    label={typeName}
                    colorText={false}
                    copyable={false}
                    showDot={false}
                    className='max-w-full min-w-0 overflow-hidden'
                  />
                </TooltipTrigger>
                <TooltipContent side='top'>{typeName}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isIonet && (
              <TooltipProvider delay={100}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        className='flex cursor-pointer items-center gap-1.5 text-xs font-medium'
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!deploymentId) {
                            return
                          }
                          const targetUrl = `/models/deployments?dFilter=${encodeURIComponent(String(deploymentId))}`
                          window.open(targetUrl, '_blank', 'noopener')
                        }}
                      />
                    }
                  >
                    <StatusBadge
                      label='IO.NET'
                      variant='purple'
                      size='sm'
                      copyable={false}
                      className='cursor-pointer'
                    />
                  </TooltipTrigger>
                  <TooltipContent side='top'>
                    <div className='max-w-xs space-y-1'>
                      <div className='text-xs'>
                        {t('From IO.NET deployment')}
                      </div>
                      {deploymentId && (
                        <div className='text-muted-foreground font-mono text-xs'>
                          {t('Deployment ID')}: {deploymentId}
                        </div>
                      )}
                      <div className='text-muted-foreground text-xs'>
                        {t('Click to open deployment')}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )
      },
      filterFn: (row, id, value) => {
        if (!value || value.length === 0 || value.includes('all')) {
          return true
        }
        return value.includes(String(row.getValue(id)))
      },
      size: 220,
      enableSorting: false,
    },

    // Status column
    {
      accessorKey: 'status',
      header: t('Status'),
      meta: { mobileBadge: true },
      cell: ({ row }) => {
        const isTagRow = isTagAggregateRow(row.original)
        const status = row.getValue('status') as number
        const channel = row.original as Channel

        // Tag row: show aggregated status
        if (isTagRow) {
          const childrenCount = (row.original as TagRow).children?.length || 0
          const hasEnabled = status === 1

          if (hasEnabled) {
            return (
              <StatusBadge
                label={`Active (${childrenCount})`}
                variant='success'
                size='sm'
                copyable={false}
                className='-ml-1.5'
              />
            )
          } else {
            return (
              <StatusBadge
                label={`Inactive (${childrenCount})`}
                variant='neutral'
                size='sm'
                copyable={false}
                className='-ml-1.5'
              />
            )
          }
        }

        // Regular channel row
        const config =
          CHANNEL_STATUS_CONFIG[status as keyof typeof CHANNEL_STATUS_CONFIG] ||
          CHANNEL_STATUS_CONFIG[0]

        const isMultiKey = isMultiKeyChannel(channel)
        const keySize = channel.channel_info?.multi_key_size ?? 0
        const disabledCount = channel.channel_info?.multi_key_status_list
          ? Object.keys(channel.channel_info.multi_key_status_list).length
          : 0
        const enabledCount = Math.max(0, keySize - disabledCount)
        const label =
          isMultiKey && keySize > 0
            ? `${t(config.label)} (${enabledCount}/${keySize})`
            : t(config.label)

        // Auto-disabled: show reason and time tooltip
        if (status === 3) {
          let statusReason = ''
          let statusTime = ''
          try {
            const otherInfo = channel.other_info
              ? JSON.parse(channel.other_info)
              : null
            if (otherInfo) {
              statusReason = otherInfo.status_reason || ''
              statusTime = otherInfo.status_time
                ? formatTimestampToDate(otherInfo.status_time)
                : ''
            }
          } catch {
            /* empty */
          }

          if (statusReason || statusTime) {
            return (
              <TooltipProvider delay={100}>
                <Tooltip>
                  <TooltipTrigger render={<span />}>
                    <StatusBadge
                      label={label}
                      variant={config.variant}
                      size='sm'
                      copyable={false}
                    />
                  </TooltipTrigger>
                  <TooltipContent side='top' className='max-w-xs'>
                    <div className='space-y-1 text-xs'>
                      {statusReason && (
                        <div>
                          {t('Reason:')} {statusReason}
                        </div>
                      )}
                      {statusTime && (
                        <div>
                          {t('Time:')} {statusTime}
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          }
        }

        return (
          <StatusBadge
            label={label}
            variant={config.variant}
            size='sm'
            copyable={false}
          />
        )
      },
      filterFn: (row, id, value) => {
        if (!value || value.length === 0 || value.includes('all')) {
          return true
        }
        const status = row.getValue(id) as number
        if (value.includes('enabled')) {
          return status === 1
        }
        if (value.includes('disabled')) {
          return status !== 1
        }
        return false
      },
      size: 120,
      enableSorting: false,
    },
  ]
}
