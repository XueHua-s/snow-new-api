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
import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { formatUseTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  getFirstResponseTimeColor,
  getResponseTimeColor,
} from '../../lib/format'
import { timingTextColorClass } from './log-detail-format'
import { DetailRow } from './log-details-layout'
import type {
  DetailsDialogProps,
  useUsageLogDetails,
} from './use-usage-log-details'

export function LogOverviewDetails({
  props,
  channelChain,
  other,
  showAdminIp,
  showTiming,
}: {
  props: DetailsDialogProps
  channelChain: ReturnType<typeof useUsageLogDetails>['channelChain']
  other: ReturnType<typeof useUsageLogDetails>['other']
  showAdminIp: ReturnType<typeof useUsageLogDetails>['showAdminIp']
  showTiming: ReturnType<typeof useUsageLogDetails>['showTiming']
}) {
  const { t } = useTranslation()
  return (
    <div className='min-w-0 space-y-1'>
      {props.log.request_id && (
        <DetailRow label={t('Request ID')} value={props.log.request_id} mono />
      )}
      {props.log.upstream_request_id && (
        <DetailRow
          label={t('Upstream Request ID')}
          value={props.log.upstream_request_id}
          mono
        />
      )}

      {props.isAdmin && props.log.channel > 0 && (
        <DetailRow
          label={t('Channel')}
          value={
            <span>
              {props.log.channel}
              {props.log.channel_name && (
                <span className='text-muted-foreground'>
                  {' '}
                  ({props.log.channel_name})
                </span>
              )}
            </span>
          }
          mono
        />
      )}

      {channelChain && props.isAdmin && (
        <DetailRow label={t('Retry Chain')} value={channelChain} mono />
      )}

      {props.log.token_name && (
        <DetailRow label={t('Token')} value={props.log.token_name} mono />
      )}

      {(props.log.group || other?.group) && (
        <DetailRow
          label={t('Group')}
          value={props.log.group || other?.group || ''}
          mono
        />
      )}

      {showAdminIp && (
        <DetailRow
          label={t('IP Address')}
          value={
            <span className='flex items-center gap-1'>
              <Globe className='size-3 text-amber-500' aria-hidden='true' />
              {props.log.ip}
            </span>
          }
          mono
        />
      )}

      {showTiming && props.log.use_time > 0 && (
        <DetailRow
          label={t('Response Time')}
          value={
            <span
              className={cn(
                'font-medium',
                timingTextColorClass(
                  getResponseTimeColor(
                    props.log.use_time,
                    props.log.completion_tokens
                  )
                )
              )}
            >
              {formatUseTime(props.log.use_time)}
              {props.log.is_stream && other?.frt != null && other.frt > 0 && (
                <span
                  className={cn(
                    'font-normal',
                    timingTextColorClass(
                      getFirstResponseTimeColor(other.frt / 1000)
                    )
                  )}
                >
                  {' '}
                  (FRT: {formatUseTime(other.frt / 1000)})
                </span>
              )}
            </span>
          }
        />
      )}
    </div>
  )
}
