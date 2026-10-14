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
import {
  AlertTriangle,
  Headphones,
  ShieldCheck,
  UserCog,
  Info,
  LogIn,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { formatLogQuota, formatTokens } from '@/lib/format'

import { quotaSaturationKindLabel } from './log-billing-format'
import { DetailRow, DetailSection } from './log-details-layout'
import type {
  DetailsDialogProps,
  useUsageLogDetails,
} from './use-usage-log-details'

export function LogAuditDetails({
  props,
  other,
  isViolation,
  isRefund,
  showTopupAuditSection,
  topupAuditFields,
  showLegacyTopupWarning,
  manageOperator,
  showManageAuditSection,
  operationText,
  authMethodLabel,
  changedFieldsText,
  auditRoute,
  isLogin,
  loginAuditFields,
  hasAudioTokens,
  reasoningEffortVariant,
}: {
  props: DetailsDialogProps
  other: ReturnType<typeof useUsageLogDetails>['other']
  isViolation: ReturnType<typeof useUsageLogDetails>['isViolation']
  isRefund: ReturnType<typeof useUsageLogDetails>['isRefund']
  showTopupAuditSection: ReturnType<
    typeof useUsageLogDetails
  >['showTopupAuditSection']
  topupAuditFields: ReturnType<typeof useUsageLogDetails>['topupAuditFields']
  showLegacyTopupWarning: ReturnType<
    typeof useUsageLogDetails
  >['showLegacyTopupWarning']
  manageOperator: ReturnType<typeof useUsageLogDetails>['manageOperator']
  showManageAuditSection: ReturnType<
    typeof useUsageLogDetails
  >['showManageAuditSection']
  operationText: ReturnType<typeof useUsageLogDetails>['operationText']
  authMethodLabel: ReturnType<typeof useUsageLogDetails>['authMethodLabel']
  changedFieldsText: ReturnType<typeof useUsageLogDetails>['changedFieldsText']
  auditRoute: ReturnType<typeof useUsageLogDetails>['auditRoute']
  isLogin: ReturnType<typeof useUsageLogDetails>['isLogin']
  loginAuditFields: ReturnType<typeof useUsageLogDetails>['loginAuditFields']
  hasAudioTokens: ReturnType<typeof useUsageLogDetails>['hasAudioTokens']
  reasoningEffortVariant: ReturnType<
    typeof useUsageLogDetails
  >['reasoningEffortVariant']
}) {
  const { t } = useTranslation()
  return (
    <>
      {/* Quota saturation marker (admin only) */}
      {props.isAdmin && other?.admin_info?.quota_saturation && (
        <DetailSection
          icon={<AlertTriangle className='size-3.5' aria-hidden='true' />}
          label={t('Quota clamped')}
          variant='danger'
        >
          <p className='mb-1 text-xs wrap-break-word'>
            {t('Quota saturation protection triggered')}
          </p>
          <DetailRow
            label={t('Kind')}
            value={quotaSaturationKindLabel(
              other.admin_info.quota_saturation.kind,
              t
            )}
          />
          <DetailRow
            label={t('Original value')}
            value={String(other.admin_info.quota_saturation.original)}
            mono
          />
          <DetailRow
            label={t('Clamped to')}
            value={String(other.admin_info.quota_saturation.clamped)}
            mono
          />
          <DetailRow
            label={t('Operation')}
            value={other.admin_info.quota_saturation.op}
            mono
          />
        </DetailSection>
      )}

      {/* Reject reason (admin only) */}
      {props.isAdmin && other?.reject_reason && (
        <DetailSection
          icon={<AlertTriangle className='size-3.5' aria-hidden='true' />}
          label={t('Reject Reason')}
          variant='danger'
        >
          <p className='text-xs wrap-break-word'>{other.reject_reason}</p>
        </DetailSection>
      )}

      {/* Violation fee info */}
      {isViolation && other && (
        <DetailSection
          icon={<AlertTriangle className='size-3.5' aria-hidden='true' />}
          label={t('Violation Fee')}
          variant='danger'
        >
          {other.violation_fee_code && (
            <DetailRow
              label={t('Violation Code')}
              value={other.violation_fee_code}
              mono
            />
          )}
          {other.violation_fee_marker && (
            <DetailRow
              label={t('Violation Marker')}
              value={other.violation_fee_marker}
            />
          )}
          <DetailRow
            label={t('Fee Amount')}
            value={formatLogQuota(other.fee_quota ?? props.log.quota)}
            mono
          />
        </DetailSection>
      )}

      {/* Refund details (type=6) */}
      {isRefund && other && (other.task_id || other.reason) && (
        <DetailSection label={t('Refund Details')}>
          {other.task_id && (
            <DetailRow label={t('Task ID')} value={other.task_id} mono />
          )}
          {other.reason && (
            <DetailRow label={t('Reason')} value={other.reason} />
          )}
        </DetailSection>
      )}

      {/* Top-up audit info (type=1, admin only) */}
      {showTopupAuditSection && (
        <DetailSection
          icon={<ShieldCheck className='size-3.5' aria-hidden='true' />}
          iconTone='success'
          label={t('Top-up Audit Info')}
        >
          {topupAuditFields.map((field) => (
            <DetailRow
              key={field.label}
              label={field.label}
              value={field.value}
              mono
            />
          ))}
          {showLegacyTopupWarning && (
            <div className='flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400'>
              <Info className='mt-0.5 size-3.5 shrink-0' aria-hidden='true' />
              <span>
                {t(
                  'This historical record predates audit-info tracking and cannot be backfilled. The current instance already records server IP, callback IP, payment method, and system version for new top-ups going forward.'
                )}
              </span>
            </div>
          )}
        </DetailSection>
      )}

      {/* Manage operator (type=3, admin only) */}
      {manageOperator && (
        <DetailRow
          label={
            <span className='flex items-center gap-1.5'>
              <UserCog
                className='text-muted-foreground size-3.5'
                aria-hidden='true'
              />
              {t('Operator Admin')}
            </span>
          }
          value={manageOperator}
          mono
        />
      )}

      {/* Operation audit info (type=3, admin only) */}
      {showManageAuditSection && (
        <DetailSection
          icon={<ShieldCheck className='size-3.5' aria-hidden='true' />}
          iconTone='info'
          label={t('Operation Audit Info')}
        >
          {operationText != null && (
            <DetailRow label={t('Operation')} value={operationText} />
          )}
          {authMethodLabel !== '' && (
            <DetailRow
              label={t('Authentication Method')}
              value={authMethodLabel}
            />
          )}
          {changedFieldsText !== '' && (
            <DetailRow label={t('Changed Fields')} value={changedFieldsText} />
          )}
          {auditRoute?.method && auditRoute?.route && (
            <DetailRow
              label={t('Request')}
              value={`${auditRoute.method} ${auditRoute.route}`}
              mono
            />
          )}
          {auditRoute?.status != null && (
            <DetailRow
              label={t('Result')}
              value={
                auditRoute.success
                  ? `${t('Success')} (${auditRoute.status})`
                  : `${t('Failed')} (${auditRoute.status})`
              }
              mono
            />
          )}
        </DetailSection>
      )}

      {/* Login audit info (type=7) */}
      {isLogin && loginAuditFields.length > 0 && (
        <DetailSection
          icon={<LogIn className='size-3.5' aria-hidden='true' />}
          iconTone='info'
          label={t('Login Info')}
        >
          {operationText != null && (
            <DetailRow label={t('Operation')} value={operationText} />
          )}
          {loginAuditFields.map((field) => (
            <DetailRow
              key={field.label}
              label={field.label}
              value={field.value}
              mono
            />
          ))}
        </DetailSection>
      )}

      {/* Audio/WebSocket token breakdown */}
      {hasAudioTokens && other && (
        <DetailSection
          icon={<Headphones className='size-3.5' aria-hidden='true' />}
          iconTone='chart-4'
          label={t('Audio Tokens')}
        >
          {other.audio_input != null && other.audio_input > 0 && (
            <DetailRow
              label={t('Audio Input')}
              value={formatTokens(other.audio_input)}
              mono
            />
          )}
          {other.audio_output != null && other.audio_output > 0 && (
            <DetailRow
              label={t('Audio Output')}
              value={formatTokens(other.audio_output)}
              mono
            />
          )}
          {other.text_input != null && other.text_input > 0 && (
            <DetailRow
              label={t('Text Input')}
              value={formatTokens(other.text_input)}
              mono
            />
          )}
          {other.text_output != null && other.text_output > 0 && (
            <DetailRow
              label={t('Text Output')}
              value={formatTokens(other.text_output)}
              mono
            />
          )}
        </DetailSection>
      )}

      {/* Reasoning effort */}
      {other?.reasoning_effort && (
        <DetailRow
          label={t('Reasoning Effort')}
          value={
            <StatusBadge
              label={other.reasoning_effort}
              variant={reasoningEffortVariant}
              size='sm'
              copyable={false}
            />
          }
        />
      )}

      {/* System prompt override */}
      {other?.is_system_prompt_overwritten && (
        <DetailRow
          label={t('System Prompt')}
          value={
            <StatusBadge
              label={t('Overwritten')}
              variant='orange'
              size='sm'
              copyable={false}
            />
          }
        />
      )}
    </>
  )
}
