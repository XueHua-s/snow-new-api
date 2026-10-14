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
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
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
import { Switch } from '@/components/ui/switch'

import { CONDITION_MODE_OPTIONS } from './param-override-definitions'
import type { PruneObjectsDraft, PruneRule } from './param-override-prune'

// ---------------------------------------------------------------------------
// PruneObjectsEditor
// ---------------------------------------------------------------------------

type PruneObjectsEditorProps = {
  operationId: string
  draft: PruneObjectsDraft
  updateDraft: (
    operationId: string,
    updater:
      | Partial<PruneObjectsDraft>
      | ((draft: PruneObjectsDraft) => PruneObjectsDraft)
  ) => void
  addRule: (operationId: string) => void
  updateRule: (
    operationId: string,
    ruleId: string,
    patch: Partial<PruneRule>
  ) => void
  removeRule: (operationId: string, ruleId: string) => void
}

export function PruneObjectsEditor(
  pruneObjectsEditorProps: PruneObjectsEditorProps
) {
  const { t } = useTranslation()
  const draft = pruneObjectsEditorProps.draft

  return (
    <div className='rounded-lg border p-3'>
      <div className='mb-2 flex items-center justify-between'>
        <span className='text-sm font-medium'>{t('Object Prune Rules')}</span>
        <div className='flex items-center gap-1'>
          <span className='text-muted-foreground text-xs'>{t('Mode')}</span>
          <Button
            type='button'
            variant={draft.simpleMode ? 'default' : 'outline'}
            size='sm'
            className='h-7 text-xs'
            onClick={() =>
              pruneObjectsEditorProps.updateDraft(
                pruneObjectsEditorProps.operationId,
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
              pruneObjectsEditorProps.updateDraft(
                pruneObjectsEditorProps.operationId,
                { simpleMode: false }
              )
            }
          >
            {t('Advanced')}
          </Button>
        </div>
      </div>

      <div className='space-y-1.5'>
        <label className='text-xs font-medium'>{t('Type (common)')}</label>
        <Input
          value={draft.typeText}
          onChange={(e) =>
            pruneObjectsEditorProps.updateDraft(
              pruneObjectsEditorProps.operationId,
              { typeText: e.target.value }
            )
          }
          placeholder='redacted_thinking'
          className='h-8 text-xs'
        />
      </div>

      {draft.simpleMode ? (
        <p className='text-muted-foreground mt-2 text-xs'>
          {t('Simple mode: prune objects by type, e.g. redacted_thinking.')}
        </p>
      ) : (
        <>
          <div className='mt-3 grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <label className='text-xs font-medium'>{t('Logic')}</label>
              <Select
                items={[
                  { value: 'AND', label: t('All Must Match (AND)') },
                  { value: 'OR', label: t('Any Match (OR)') },
                ]}
                value={draft.logic}
                onValueChange={(v) =>
                  pruneObjectsEditorProps.updateDraft(
                    pruneObjectsEditorProps.operationId,
                    { logic: v || 'AND' }
                  )
                }
              >
                <SelectTrigger className='h-8 text-xs'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='AND'>
                      {t('All Must Match (AND)')}
                    </SelectItem>
                    <SelectItem value='OR'>{t('Any Match (OR)')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1'>
              <label className='text-xs font-medium'>
                {t('Recursion Strategy')}
              </label>
              <div className='flex gap-1'>
                <Button
                  type='button'
                  variant={draft.recursive ? 'default' : 'outline'}
                  size='sm'
                  className='h-8 text-xs'
                  onClick={() =>
                    pruneObjectsEditorProps.updateDraft(
                      pruneObjectsEditorProps.operationId,
                      { recursive: true }
                    )
                  }
                >
                  {t('Recursive')}
                </Button>
                <Button
                  type='button'
                  variant={draft.recursive ? 'outline' : 'default'}
                  size='sm'
                  className='h-8 text-xs'
                  onClick={() =>
                    pruneObjectsEditorProps.updateDraft(
                      pruneObjectsEditorProps.operationId,
                      { recursive: false }
                    )
                  }
                >
                  {t('Current Level Only')}
                </Button>
              </div>
            </div>
          </div>

          <div className='bg-muted/30 mt-3 rounded-md border p-2'>
            <div className='mb-2 flex items-center justify-between'>
              <span className='text-xs font-medium'>
                {t('Additional Conditions')}
              </span>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-7 text-xs'
                onClick={() =>
                  pruneObjectsEditorProps.addRule(
                    pruneObjectsEditorProps.operationId
                  )
                }
              >
                <Plus className='mr-1 h-3 w-3' />
                {t('Add Condition')}
              </Button>
            </div>
            {draft.rules.length === 0 ? (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Without additional conditions, only the type above is used for pruning.'
                )}
              </p>
            ) : (
              <div className='space-y-2'>
                {draft.rules.map((rule, ruleIndex) => (
                  <div
                    key={rule.id}
                    className='bg-background rounded-md border p-2'
                  >
                    <div className='mb-1 flex items-center justify-between'>
                      <Badge variant='outline' className='text-[10px]'>
                        R{ruleIndex + 1}
                      </Badge>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='text-destructive hover:text-destructive h-6 text-[10px]'
                        onClick={() =>
                          pruneObjectsEditorProps.removeRule(
                            pruneObjectsEditorProps.operationId,
                            rule.id
                          )
                        }
                      >
                        <Trash2 className='mr-1 h-3 w-3' />
                        {t('Delete')}
                      </Button>
                    </div>
                    <div className='grid gap-2 sm:grid-cols-3'>
                      <div className='space-y-0.5'>
                        <label className='text-[10px] font-medium'>
                          {t('Field Path')}
                        </label>
                        <Input
                          value={rule.path}
                          onChange={(e) =>
                            pruneObjectsEditorProps.updateRule(
                              pruneObjectsEditorProps.operationId,
                              rule.id,
                              { path: e.target.value }
                            )
                          }
                          placeholder='type'
                          className='h-7 text-xs'
                        />
                      </div>
                      <div className='space-y-0.5'>
                        <label className='text-[10px] font-medium'>
                          {t('Match Mode')}
                        </label>
                        <Select
                          items={CONDITION_MODE_OPTIONS.map((o) => ({
                            value: o.value,
                            label: t(o.label),
                          }))}
                          value={rule.mode}
                          onValueChange={(v) =>
                            v !== null &&
                            pruneObjectsEditorProps.updateRule(
                              pruneObjectsEditorProps.operationId,
                              rule.id,
                              { mode: v }
                            )
                          }
                        >
                          <SelectTrigger className='h-7 text-xs'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent alignItemWithTrigger={false}>
                            <SelectGroup>
                              {CONDITION_MODE_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {t(o.label)}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className='space-y-0.5'>
                        <label className='text-[10px] font-medium'>
                          {t('Match Value (optional)')}
                        </label>
                        <Input
                          value={rule.value_text}
                          onChange={(e) =>
                            pruneObjectsEditorProps.updateRule(
                              pruneObjectsEditorProps.operationId,
                              rule.id,
                              { value_text: e.target.value }
                            )
                          }
                          placeholder='redacted_thinking'
                          className='h-7 text-xs'
                        />
                      </div>
                    </div>
                    <div className='mt-1.5 flex flex-wrap gap-3'>
                      <label className='flex items-center gap-1.5 text-[10px]'>
                        <Switch
                          checked={rule.invert}
                          onCheckedChange={(checked) =>
                            pruneObjectsEditorProps.updateRule(
                              pruneObjectsEditorProps.operationId,
                              rule.id,
                              { invert: checked }
                            )
                          }
                        />
                        {t('Invert match')}
                      </label>
                      <label className='flex items-center gap-1.5 text-[10px]'>
                        <Switch
                          checked={rule.pass_missing_key}
                          onCheckedChange={(checked) =>
                            pruneObjectsEditorProps.updateRule(
                              pruneObjectsEditorProps.operationId,
                              rule.id,
                              { pass_missing_key: checked }
                            )
                          }
                        />
                        {t('Pass when key is missing')}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
