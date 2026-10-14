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
import { Textarea } from '@/components/ui/textarea'

import type { ReturnErrorDraft } from './param-override-return-error'

// ---------------------------------------------------------------------------
// ReturnErrorEditor
// ---------------------------------------------------------------------------

type ReturnErrorEditorProps = {
  operationId: string
  draft: ReturnErrorDraft
  updateDraft: (
    operationId: string,
    draftPatch: Partial<ReturnErrorDraft>
  ) => void
}

export function ReturnErrorEditor(
  returnErrorEditorProps: ReturnErrorEditorProps
) {
  const { t } = useTranslation()
  const draft = returnErrorEditorProps.draft

  return (
    <div className='rounded-lg border p-3'>
      <div className='mb-2 flex items-center justify-between'>
        <span className='text-sm font-medium'>
          {t('Custom Error Response')}
        </span>
        <div className='flex items-center gap-1'>
          <span className='text-muted-foreground text-xs'>{t('Mode')}</span>
          <Button
            type='button'
            variant={draft.simpleMode ? 'default' : 'outline'}
            size='sm'
            className='h-7 text-xs'
            onClick={() =>
              returnErrorEditorProps.updateDraft(
                returnErrorEditorProps.operationId,
                { simpleMode: true }
              )
            }
          >
            {t('Simple')}
          </Button>
          <Button
            type='button'
            variant={draft.simpleMode ? 'outline' : 'default'}
            size='sm'
            className='h-7 text-xs'
            onClick={() =>
              returnErrorEditorProps.updateDraft(
                returnErrorEditorProps.operationId,
                { simpleMode: false }
              )
            }
          >
            {t('Advanced')}
          </Button>
        </div>
      </div>

      <div className='space-y-1.5'>
        <label className='text-xs font-medium'>
          {t('Error Message (required)')}
        </label>
        <Textarea
          value={draft.message}
          onChange={(e) =>
            returnErrorEditorProps.updateDraft(
              returnErrorEditorProps.operationId,
              { message: e.target.value }
            )
          }
          placeholder={t('e.g. This request does not meet access policy')}
          rows={2}
          className='text-xs'
        />
      </div>

      {draft.simpleMode ? (
        <p className='text-muted-foreground mt-2 text-xs'>
          {t(
            'Simple mode only returns message; status code and error type use system defaults.'
          )}
        </p>
      ) : (
        <>
          <div className='mt-3 grid gap-3 sm:grid-cols-3'>
            <div className='space-y-1'>
              <label className='text-xs font-medium'>{t('Status Code')}</label>
              <Input
                value={String(draft.statusCode ?? '')}
                onChange={(e) =>
                  returnErrorEditorProps.updateDraft(
                    returnErrorEditorProps.operationId,
                    { statusCode: Number.parseInt(e.target.value, 10) || 400 }
                  )
                }
                placeholder='400'
                className='h-8 text-xs'
              />
            </div>
            <div className='space-y-1'>
              <label className='text-xs font-medium'>
                {t('Error Code (optional)')}
              </label>
              <Input
                value={draft.code}
                onChange={(e) =>
                  returnErrorEditorProps.updateDraft(
                    returnErrorEditorProps.operationId,
                    { code: e.target.value }
                  )
                }
                placeholder='forced_bad_request'
                className='h-8 text-xs'
              />
            </div>
            <div className='space-y-1'>
              <label className='text-xs font-medium'>
                {t('Error Type (optional)')}
              </label>
              <Input
                value={draft.type}
                onChange={(e) =>
                  returnErrorEditorProps.updateDraft(
                    returnErrorEditorProps.operationId,
                    { type: e.target.value }
                  )
                }
                placeholder='invalid_request_error'
                className='h-8 text-xs'
              />
            </div>
          </div>
          <div className='mt-2 flex items-center gap-2'>
            <span className='text-muted-foreground text-xs'>
              {t('Retry Suggestion')}
            </span>
            <Button
              type='button'
              variant={draft.skipRetry ? 'default' : 'outline'}
              size='sm'
              className='h-7 text-xs'
              onClick={() =>
                returnErrorEditorProps.updateDraft(
                  returnErrorEditorProps.operationId,
                  { skipRetry: true }
                )
              }
            >
              {t('Stop Retry')}
            </Button>
            <Button
              type='button'
              variant={draft.skipRetry ? 'outline' : 'default'}
              size='sm'
              className='h-7 text-xs'
              onClick={() =>
                returnErrorEditorProps.updateDraft(
                  returnErrorEditorProps.operationId,
                  { skipRetry: false }
                )
              }
            >
              {t('Allow Retry')}
            </Button>
          </div>
          <div className='mt-2 flex flex-wrap gap-1'>
            {[
              {
                label: 'Bad Request',
                statusCode: 400,
                code: 'invalid_request',
                type: 'invalid_request_error',
              },
              {
                label: 'Unauthorized',
                statusCode: 401,
                code: 'unauthorized',
                type: 'authentication_error',
              },
              {
                label: 'Rate Limited',
                statusCode: 429,
                code: 'rate_limited',
                type: 'rate_limit_error',
              },
            ].map((preset) => (
              <Button
                key={preset.code}
                type='button'
                variant='outline'
                size='sm'
                className='h-6 text-[10px]'
                onClick={() =>
                  returnErrorEditorProps.updateDraft(
                    returnErrorEditorProps.operationId,
                    {
                      statusCode: preset.statusCode,
                      code: preset.code,
                      type: preset.type,
                    }
                  )
                }
              >
                {t(preset.label)}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
