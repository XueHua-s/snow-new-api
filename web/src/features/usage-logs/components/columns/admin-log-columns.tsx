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
import { GitBranch, Sparkles } from 'lucide-react'
import type { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { cn } from '@/lib/utils'

import type { UsageLog } from '../../data/schema'
import { parseLogOther } from '../../lib/format'
import { isDisplayableLogType } from '../../lib/utils'
import { useUsageLogsContext } from '../usage-logs-provider'

export function buildAdminLogColumns(
  t: ReturnType<typeof useTranslation>['t']
): ColumnDef<UsageLog>[] {
  return [
    {
      id: 'channel',
      header: t('Channel'),
      accessorFn: (row) => row.channel,
      cell: function ChannelCell({ row }) {
        const { sensitiveVisible, setAffinityTarget, setAffinityDialogOpen } =
          useUsageLogsContext()
        const log = row.original

        if (!isDisplayableLogType(log.type)) return null

        const other = parseLogOther(log.other)
        const affinity = other?.admin_info?.channel_affinity
        const rawUseChannel = other?.admin_info?.use_channel ?? []
        const useChannel = Array.isArray(rawUseChannel)
          ? rawUseChannel.map(String).filter(Boolean)
          : []
        const hasRetryChain = useChannel.length > 1
        const channelChain = hasRetryChain ? useChannel.join(' → ') : undefined
        const channelDisplay = log.channel_name
          ? `${log.channel_name} #${log.channel}`
          : `#${log.channel}`
        const channelIdDisplay = `#${log.channel}`
        const channelName = sensitiveVisible ? log.channel_name : '••••'
        const multiKeyIndex = other?.admin_info?.multi_key_index
        const showMultiKeyIndex =
          other?.admin_info?.is_multi_key === true &&
          typeof multiKeyIndex === 'number' &&
          Number.isFinite(multiKeyIndex)

        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={<div className='flex max-w-[160px] flex-col gap-0.5' />}
              >
                <div className='relative inline-flex w-fit items-center gap-1'>
                  <StatusBadge
                    label={channelIdDisplay}
                    autoColor={String(log.channel)}
                    copyText={String(log.channel)}
                    size='sm'
                    showDot={false}
                    className='font-mono'
                  />
                  {showMultiKeyIndex && (
                    <StatusBadge
                      label={String(multiKeyIndex)}
                      size='sm'
                      showDot={false}
                      copyable={false}
                      variant='neutral'
                      className='h-5 min-w-5 justify-center rounded-full px-1 font-mono text-xs'
                      aria-label={`${t('Key')} ${multiKeyIndex}`}
                    />
                  )}
                  {hasRetryChain && (
                    <Popover>
                      <PopoverTrigger
                        render={
                          <button
                            type='button'
                            className='text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none'
                            aria-label={t('Retry Chain')}
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        <GitBranch
                          className='size-3.5 text-amber-500'
                          aria-hidden='true'
                        />
                      </PopoverTrigger>
                      <PopoverContent
                        side='top'
                        align='start'
                        className='w-64 text-xs'
                      >
                        <div className='flex flex-col gap-1'>
                          <p className='font-medium'>{t('Retry Chain')}</p>
                          <p className='text-muted-foreground font-mono break-all'>
                            {channelChain}
                          </p>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  {affinity && (
                    <button
                      type='button'
                      className='absolute -top-1 -right-1 leading-none text-amber-500'
                      onClick={(e) => {
                        e.stopPropagation()
                        setAffinityTarget({
                          rule_name: affinity.rule_name || '',
                          using_group:
                            affinity.using_group ||
                            affinity.selected_group ||
                            '',
                          key_hint: affinity.key_hint || '',
                          key_fp: affinity.key_fp || '',
                        })
                        setAffinityDialogOpen(true)
                      }}
                    >
                      <Sparkles className='size-3 fill-current' />
                    </button>
                  )}
                </div>
                {log.channel_name && (
                  <span className='text-muted-foreground/70 truncate [font-family:var(--font-body)] !text-xs'>
                    {channelName}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent>
                <div className='space-y-1'>
                  <p>{sensitiveVisible ? channelDisplay : channelIdDisplay}</p>
                  {channelChain && (
                    <p className='text-muted-foreground text-xs'>
                      {t('Chain')}: {channelChain}
                    </p>
                  )}
                  {showMultiKeyIndex && (
                    <p className='text-muted-foreground text-xs'>
                      {t('Key')}: {multiKeyIndex}
                    </p>
                  )}
                  {affinity && (
                    <div className='border-t pt-1 text-xs'>
                      <p className='font-medium'>{t('Channel Affinity')}</p>
                      <p>
                        {t('Rule')}: {affinity.rule_name || '-'}
                      </p>
                      <p>
                        {t('Group')}:{' '}
                        {sensitiveVisible
                          ? affinity.using_group ||
                            affinity.selected_group ||
                            '-'
                          : '••••'}
                      </p>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      },
    },
    {
      id: 'user',
      header: t('User'),
      accessorFn: (row) => row.username,
      cell: function UserCell({ row }) {
        const { sensitiveVisible, setSelectedUserId, setUserInfoDialogOpen } =
          useUsageLogsContext()
        const log = row.original

        if (!log.username) return null

        return (
          <button
            type='button'
            className='flex items-center gap-1.5 text-left'
            onClick={(e) => {
              e.stopPropagation()
              setSelectedUserId(log.user_id)
              setUserInfoDialogOpen(true)
            }}
          >
            <Avatar className='ring-border/60 size-6 ring-1 max-sm:hidden'>
              <AvatarFallback
                className={cn(
                  'text-[11px] font-semibold',
                  !sensitiveVisible && 'bg-muted text-muted-foreground'
                )}
                style={
                  sensitiveVisible
                    ? getUserAvatarStyle(log.username)
                    : undefined
                }
              >
                {sensitiveVisible ? getUserAvatarFallback(log.username) : '•'}
              </AvatarFallback>
            </Avatar>
            <TooltipProvider delay={300}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className='text-muted-foreground max-w-[100px] truncate text-sm hover:underline' />
                  }
                >
                  {sensitiveVisible ? log.username : '••••'}
                </TooltipTrigger>
                {sensitiveVisible && log.username.length > 12 && (
                  <TooltipContent side='top'>{log.username}</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </button>
        )
      },
    },
  ]
}
