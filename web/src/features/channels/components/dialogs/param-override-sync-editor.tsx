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
import { useTranslation } from 'react-i18next'

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

import {
  type ParamOverrideOperation,
  SYNC_TARGET_TYPE_OPTIONS,
} from './param-override-definitions'
import { buildSyncTargetSpec } from './param-override-values'

// ---------------------------------------------------------------------------
// SyncFieldsEditor
// ---------------------------------------------------------------------------

type SyncFieldsEditorProps = {
  operationId: string
  syncFromTarget: { type: string; key: string }
  syncToTarget: { type: string; key: string }
  updateOperation: (
    operationId: string,
    patch: Partial<ParamOverrideOperation>
  ) => void
}

export function SyncFieldsEditor(syncFieldsEditorProps: SyncFieldsEditorProps) {
  const { t } = useTranslation()
  return (
    <div className='space-y-3'>
      <label className='text-xs font-medium'>{t('Sync Endpoints')}</label>
      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-1.5'>
          <label className='text-[10px] font-medium'>
            {t('Source Endpoint')}
          </label>
          <div className='flex gap-2'>
            <Select
              items={SYNC_TARGET_TYPE_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.label),
              }))}
              value={syncFieldsEditorProps.syncFromTarget.type || 'json'}
              onValueChange={(v) =>
                v !== null &&
                syncFieldsEditorProps.updateOperation(
                  syncFieldsEditorProps.operationId,
                  {
                    from: buildSyncTargetSpec(
                      v,
                      syncFieldsEditorProps.syncFromTarget.key
                    ),
                  }
                )
              }
            >
              <SelectTrigger className='h-8 w-[110px] text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {SYNC_TARGET_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {t(o.label)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input
              value={syncFieldsEditorProps.syncFromTarget.key}
              onChange={(e) =>
                syncFieldsEditorProps.updateOperation(
                  syncFieldsEditorProps.operationId,
                  {
                    from: buildSyncTargetSpec(
                      syncFieldsEditorProps.syncFromTarget.type,
                      e.target.value
                    ),
                  }
                )
              }
              placeholder='session_id'
              className='h-8 text-xs'
            />
          </div>
        </div>
        <div className='space-y-1.5'>
          <label className='text-[10px] font-medium'>
            {t('Target Endpoint')}
          </label>
          <div className='flex gap-2'>
            <Select
              items={SYNC_TARGET_TYPE_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.label),
              }))}
              value={syncFieldsEditorProps.syncToTarget.type || 'json'}
              onValueChange={(v) =>
                v !== null &&
                syncFieldsEditorProps.updateOperation(
                  syncFieldsEditorProps.operationId,
                  {
                    to: buildSyncTargetSpec(
                      v,
                      syncFieldsEditorProps.syncToTarget.key
                    ),
                  }
                )
              }
            >
              <SelectTrigger className='h-8 w-[110px] text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {SYNC_TARGET_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {t(o.label)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input
              value={syncFieldsEditorProps.syncToTarget.key}
              onChange={(e) =>
                syncFieldsEditorProps.updateOperation(
                  syncFieldsEditorProps.operationId,
                  {
                    to: buildSyncTargetSpec(
                      syncFieldsEditorProps.syncToTarget.type,
                      e.target.value
                    ),
                  }
                )
              }
              placeholder='prompt_cache_key'
              className='h-8 text-xs'
            />
          </div>
        </div>
      </div>
      <div className='flex flex-wrap gap-1'>
        {[
          {
            label: 'header:session_id -> json:prompt_cache_key',
            from: 'header:session_id',
            to: 'json:prompt_cache_key',
          },
          {
            label: 'json:prompt_cache_key -> header:session_id',
            from: 'json:prompt_cache_key',
            to: 'header:session_id',
          },
        ].map((preset) => (
          <Button
            key={preset.label}
            type='button'
            variant='outline'
            size='sm'
            className='h-6 text-[10px]'
            onClick={() =>
              syncFieldsEditorProps.updateOperation(
                syncFieldsEditorProps.operationId,
                { from: preset.from, to: preset.to }
              )
            }
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
