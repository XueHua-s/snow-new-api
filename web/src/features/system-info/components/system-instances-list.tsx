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
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'
import { formatTimestampRelative, formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { SystemInstance, SystemInstanceStatus } from '../types'
import { getNodeName } from './system-instance-labels'
import { ResourceCell } from './system-instance-resources'
import { formatBytes } from './system-resource-format'

const STATUS_CLASS_NAME: Record<SystemInstanceStatus, string> = {
  online:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  stale: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}

const STATUS_DOT_CLASS_NAME: Record<SystemInstanceStatus, string> = {
  online: 'bg-emerald-500',
  stale: 'bg-amber-500',
}

function roleLabel(instance: SystemInstance) {
  if (instance.info?.role?.is_master) return 'master'
  return 'worker'
}

function roleDescriptionKey(instance: SystemInstance) {
  if (instance.info?.role?.is_master) {
    return 'Master instances run scheduled background tasks.'
  }
  return 'Worker instances do not run master-only background tasks.'
}

function runtimeLabel(instance: SystemInstance) {
  const runtime = instance.info?.runtime
  if (!runtime?.goos && !runtime?.goarch) return '-'

  const parts: string[] = []
  if (runtime.goos || runtime.goarch) {
    parts.push([runtime.goos, runtime.goarch].filter(Boolean).join('/'))
  }
  return parts.join(' · ')
}

type SystemInstancesTableProps = {
  instances: SystemInstance[]
  deletingNodeName: string | null
  isDeletingInstance: boolean
  onDeleteStaleInstance: (instance: SystemInstance) => void
}

export function SystemInstancesList(props: SystemInstancesTableProps) {
  const { t, i18n } = useTranslation()

  return (
    <div className='overflow-x-auto rounded-md border'>
      <Table className='min-w-[1230px]'>
        <TableHeader>
          <TableRow className='bg-muted/40 hover:bg-muted/40'>
            <TableHead className='h-9 min-w-[240px] px-4 text-xs'>
              {t('Instances')}
            </TableHead>
            <TableHead className='h-9 w-[110px] text-xs'>
              {t('Status')}
            </TableHead>
            <TableHead className='h-9 w-[100px] text-xs'>{t('Role')}</TableHead>
            <TableHead className='h-9 w-[96px] text-xs'>{t('CPU')}</TableHead>
            <TableHead className='h-9 w-[96px] text-xs'>
              {t('Memory')}
            </TableHead>
            <TableHead className='h-9 w-[96px] text-xs'>
              {t('Storage')}
            </TableHead>
            <TableHead className='h-9 w-[100px] text-xs'>
              {t('Version')}
            </TableHead>
            <TableHead className='h-9 w-[140px] text-xs'>
              {t('Runtime')}
            </TableHead>
            <TableHead className='h-9 w-[170px] text-xs'>
              {t('Started')}
            </TableHead>
            <TableHead className='h-9 w-[170px] text-xs'>
              {t('Last Seen')}
            </TableHead>
            <TableHead className='h-9 w-[90px] pr-4 text-right text-xs'>
              {t('Actions')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.instances.map((instance) => {
            const shouldConfigure =
              instance.info?.node?.should_configure_manually === true
            const resources = instance.info?.resources
            const storage = resources?.storage
            const isDeletingThisInstance =
              props.isDeletingInstance &&
              props.deletingNodeName === instance.node_name
            return (
              <TableRow key={instance.node_name} className='hover:bg-muted/30'>
                <TableCell className='px-4 py-2.5 align-middle'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        STATUS_DOT_CLASS_NAME[instance.status]
                      )}
                      aria-hidden='true'
                    />
                    <div className='min-w-0'>
                      <div className='flex min-w-0 items-center gap-1.5'>
                        <span className='truncate text-sm font-medium'>
                          {getNodeName(instance)}
                        </span>
                        {shouldConfigure && (
                          <Popover>
                            <PopoverTrigger
                              className='inline-flex shrink-0 rounded-full focus-visible:ring-2 focus-visible:outline-none'
                              aria-label={t('Configure NODE_NAME')}
                            >
                              <Badge
                                variant='outline'
                                className='border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300'
                              >
                                <AlertTriangle
                                  className='size-3'
                                  aria-hidden='true'
                                />
                              </Badge>
                            </PopoverTrigger>
                            <PopoverContent align='start' className='w-80'>
                              <PopoverHeader>
                                <PopoverTitle>
                                  {t('Configure NODE_NAME')}
                                </PopoverTitle>
                                <PopoverDescription>
                                  {t(
                                    'This instance is using an automatic hostname. Set NODE_NAME to a stable unique value for multi-instance management.'
                                  )}
                                </PopoverDescription>
                              </PopoverHeader>
                              <div className='space-y-2 text-xs'>
                                <div>
                                  <div className='mb-1 font-medium'>
                                    {t('Example')}
                                  </div>
                                  <code className='bg-muted block rounded-md px-2 py-1.5 font-mono text-[11px] break-all'>
                                    NODE_NAME=new-api-master-1
                                  </code>
                                </div>
                                <p className='text-muted-foreground'>
                                  {t(
                                    'Use a different stable value for each instance, then restart the service.'
                                  )}
                                </p>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                      <div className='text-muted-foreground truncate font-mono text-[11px]'>
                        {instance.info?.host?.hostname || '-'}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className='py-2.5 align-middle'>
                  <Badge
                    variant='secondary'
                    className={cn(
                      'gap-1.5',
                      STATUS_CLASS_NAME[instance.status]
                    )}
                  >
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        STATUS_DOT_CLASS_NAME[instance.status]
                      )}
                      aria-hidden='true'
                    />
                    {t(instance.status)}
                  </Badge>
                </TableCell>
                <TableCell className='py-2.5 align-middle'>
                  <TooltipProvider delay={100}>
                    <Tooltip>
                      <TooltipTrigger
                        className='inline-flex shrink-0 rounded-full focus-visible:ring-2 focus-visible:outline-none'
                        aria-label={t('Node role')}
                      >
                        <Badge variant='outline'>{roleLabel(instance)}</Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t(roleDescriptionKey(instance))}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className='py-2.5 align-middle'>
                  <ResourceCell value={resources?.cpu?.usage_percent} />
                </TableCell>
                <TableCell className='py-2.5 align-middle'>
                  <ResourceCell value={resources?.memory?.usage_percent} />
                </TableCell>
                <TableCell className='py-2.5 align-middle'>
                  <ResourceCell
                    value={storage?.used_percent}
                    tooltip={
                      storage ? (
                        <div className='space-y-1 text-xs'>
                          <div className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
                            <span className='text-muted-foreground'>
                              {t('Used')}
                            </span>
                            <span className='font-mono'>
                              {formatBytes(storage.used_bytes)}
                            </span>
                            <span className='text-muted-foreground'>
                              {t('Free')}
                            </span>
                            <span className='font-mono'>
                              {formatBytes(storage.free_bytes)}
                            </span>
                            <span className='text-muted-foreground'>
                              {t('Total')}
                            </span>
                            <span className='font-mono'>
                              {formatBytes(storage.total_bytes)}
                            </span>
                          </div>
                        </div>
                      ) : undefined
                    }
                  />
                </TableCell>
                <TableCell className='py-2.5 align-middle'>
                  <div className='truncate font-mono text-xs'>
                    {instance.info?.runtime?.version || '-'}
                  </div>
                </TableCell>
                <TableCell className='py-2.5 align-middle'>
                  <div className='truncate font-mono text-xs'>
                    {runtimeLabel(instance)}
                  </div>
                </TableCell>
                <TableCell className='text-muted-foreground py-2.5 align-middle text-xs whitespace-nowrap'>
                  {formatTimestampToDate(instance.started_at)}
                </TableCell>
                <TableCell
                  className='text-muted-foreground py-2.5 align-middle text-xs whitespace-nowrap'
                  title={formatTimestampToDate(instance.last_seen_at)}
                >
                  {formatTimestampRelative(
                    instance.last_seen_at,
                    'seconds',
                    toIntlLocale(i18n.language)
                  )}
                </TableCell>
                <TableCell className='py-2.5 pr-4 text-right align-middle'>
                  {instance.status === 'stale' ? (
                    <TooltipProvider delay={100}>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type='button'
                              variant='destructive'
                              size='icon-xs'
                              onClick={() =>
                                props.onDeleteStaleInstance(instance)
                              }
                              disabled={
                                props.isDeletingInstance ||
                                isDeletingThisInstance
                              }
                              aria-label={t('Delete stale instance')}
                            >
                              {isDeletingThisInstance ? (
                                <Loader2
                                  className='size-3 animate-spin'
                                  aria-hidden='true'
                                />
                              ) : (
                                <Trash2 className='size-3' aria-hidden='true' />
                              )}
                            </Button>
                          }
                        />
                        <TooltipContent>
                          {t('Delete stale instance')}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <span className='text-muted-foreground text-xs'>-</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
