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
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { ConditionEditor } from './param-override-condition-editor'
import {
  type ParamOverrideOperation,
  type ParamOverrideCondition,
  MODE_META,
  OPERATION_MODE_OPTIONS,
  MODE_DESCRIPTIONS,
} from './param-override-definitions'
import { ReturnErrorEditor } from './param-override-error-editor'
import type { PruneObjectsDraft, PruneRule } from './param-override-prune'
import { PruneObjectsEditor } from './param-override-prune-editor'
import type { ReturnErrorDraft } from './param-override-return-error'
import { SyncFieldsEditor } from './param-override-sync-editor'
import {
  parseSyncTargetSpec,
  getOperationSummary,
  getModePathLabel,
  getModePathPlaceholder,
  getModeValueLabel,
  getModeValuePlaceholder,
  getModeFromLabel,
  getModeFromPlaceholder,
  getModeToLabel,
  getModeToPlaceholder,
} from './param-override-values'

// ---------------------------------------------------------------------------
// RuleEditor sub-component
// ---------------------------------------------------------------------------

type RuleEditorProps = {
  operation: ParamOverrideOperation
  operationIndex: number
  operations: ParamOverrideOperation[]
  returnErrorDraft: ReturnErrorDraft | null
  pruneObjectsDraft: PruneObjectsDraft | null
  expandedConditions: Record<string, boolean>
  setExpandedConditions: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >
  updateOperation: (
    operationId: string,
    patch: Partial<ParamOverrideOperation>
  ) => void
  duplicateOperation: (operationId: string) => void
  removeOperation: (operationId: string) => void
  addCondition: (operationId: string) => void
  updateCondition: (
    operationId: string,
    conditionId: string,
    patch: Partial<ParamOverrideCondition>
  ) => void
  removeCondition: (operationId: string, conditionId: string) => void
  updateReturnErrorDraft: (
    operationId: string,
    draftPatch: Partial<ReturnErrorDraft>
  ) => void
  updatePruneObjectsDraft: (
    operationId: string,
    updater:
      | Partial<PruneObjectsDraft>
      | ((draft: PruneObjectsDraft) => PruneObjectsDraft)
  ) => void
  addPruneRule: (operationId: string) => void
  updatePruneRule: (
    operationId: string,
    ruleId: string,
    patch: Partial<PruneRule>
  ) => void
  removePruneRule: (operationId: string, ruleId: string) => void
  expandAllConditions: () => void
  collapseAllConditions: () => void
}

export function RuleEditor(ruleEditorProps: RuleEditorProps) {
  const { t } = useTranslation()
  const operation = ruleEditorProps.operation
  const mode = operation.mode || 'set'
  const meta = MODE_META[mode] || MODE_META.set
  const conditions = operation.conditions
  const syncFromTarget =
    mode === 'sync_fields' ? parseSyncTargetSpec(operation.from) : null
  const syncToTarget =
    mode === 'sync_fields' ? parseSyncTargetSpec(operation.to) : null

  return (
    <ScrollArea className='flex-1'>
      <div className='space-y-4 p-4'>
        {/* Header */}
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Badge variant='outline'>
              #{ruleEditorProps.operationIndex + 1}
            </Badge>
            <span className='text-muted-foreground line-clamp-1 text-xs'>
              {getOperationSummary(operation, ruleEditorProps.operationIndex)}
            </span>
          </div>
          <div className='flex items-center gap-1'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => ruleEditorProps.duplicateOperation(operation.id)}
            >
              <Copy className='mr-1 h-3.5 w-3.5' />
              {t('Duplicate')}
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='text-destructive hover:text-destructive'
              onClick={() => ruleEditorProps.removeOperation(operation.id)}
            >
              <Trash2 className='mr-1 h-3.5 w-3.5' />
              {t('Delete')}
            </Button>
          </div>
        </div>

        {/* Operation type + path */}
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <label className='text-xs font-medium'>{t('Operation Type')}</label>
            <Select
              items={OPERATION_MODE_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.label),
              }))}
              value={mode}
              onValueChange={(nextMode) =>
                nextMode !== null &&
                ruleEditorProps.updateOperation(operation.id, {
                  mode: nextMode,
                })
              }
            >
              <SelectTrigger className='h-9'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {OPERATION_MODE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {t(o.label)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {(meta.path || meta.pathOptional) && (
            <div className='space-y-1.5'>
              <label className='text-xs font-medium'>
                {t(getModePathLabel(mode))}
              </label>
              <Input
                value={operation.path}
                onChange={(e) =>
                  ruleEditorProps.updateOperation(operation.id, {
                    path: e.target.value,
                  })
                }
                placeholder={getModePathPlaceholder(mode)}
                className='h-9'
              />
            </div>
          )}
        </div>

        {/* Mode description */}
        {MODE_DESCRIPTIONS[mode] && (
          <p className='text-muted-foreground text-xs'>
            {t(MODE_DESCRIPTIONS[mode])}
          </p>
        )}

        {/* Description */}
        <div className='space-y-1.5'>
          <div className='flex items-center justify-between'>
            <label className='text-xs font-medium'>
              {t('Rule Description (optional)')}
            </label>
            <span className='text-muted-foreground text-[10px]'>
              {operation.description.length}/180
            </span>
          </div>
          <Input
            value={operation.description}
            onChange={(e) =>
              ruleEditorProps.updateOperation(operation.id, {
                description: e.target.value,
              })
            }
            placeholder={t(
              'e.g. Clean tool parameters to avoid upstream validation errors'
            )}
            maxLength={180}
            className='h-9'
          />
        </div>

        {/* Value section */}
        {meta.value && (
          <>
            {mode === 'return_error' && ruleEditorProps.returnErrorDraft && (
              <ReturnErrorEditor
                operationId={operation.id}
                draft={ruleEditorProps.returnErrorDraft}
                updateDraft={ruleEditorProps.updateReturnErrorDraft}
              />
            )}
            {!(mode === 'return_error' && ruleEditorProps.returnErrorDraft) && (
              <>
                {mode === 'prune_objects' &&
                  ruleEditorProps.pruneObjectsDraft && (
                    <PruneObjectsEditor
                      operationId={operation.id}
                      draft={ruleEditorProps.pruneObjectsDraft}
                      updateDraft={ruleEditorProps.updatePruneObjectsDraft}
                      addRule={ruleEditorProps.addPruneRule}
                      updateRule={ruleEditorProps.updatePruneRule}
                      removeRule={ruleEditorProps.removePruneRule}
                    />
                  )}
                {!(
                  mode === 'prune_objects' && ruleEditorProps.pruneObjectsDraft
                ) && (
                  <div className='space-y-1.5'>
                    <div className='flex items-center justify-between'>
                      <label className='text-xs font-medium'>
                        {t(getModeValueLabel(mode))}
                      </label>
                      {operation.value_text.trim().startsWith('{') && (
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='text-muted-foreground h-auto px-1.5 py-0.5 text-xs'
                          onClick={() => {
                            try {
                              const parsed = JSON.parse(operation.value_text)
                              ruleEditorProps.updateOperation(operation.id, {
                                value_text: JSON.stringify(parsed, null, 2),
                              })
                            } catch {
                              /* not valid JSON */
                            }
                          }}
                        >
                          {t('Format')}
                        </Button>
                      )}
                    </div>
                    <Textarea
                      value={operation.value_text}
                      onChange={(e) =>
                        ruleEditorProps.updateOperation(operation.id, {
                          value_text: e.target.value,
                        })
                      }
                      placeholder={getModeValuePlaceholder(mode)}
                      rows={3}
                      className='max-h-[200px] resize-y overflow-y-auto font-mono text-xs'
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* keep_origin */}
        {meta.keepOrigin && (
          <div className='flex items-center justify-between rounded-lg border px-3 py-2'>
            <p className='text-sm font-medium'>
              {t('Keep original value (skip if target exists)')}
            </p>
            <Switch
              checked={operation.keep_origin}
              onCheckedChange={(checked) =>
                ruleEditorProps.updateOperation(operation.id, {
                  keep_origin: checked,
                })
              }
            />
          </div>
        )}

        {/* sync_fields */}

        {mode === 'sync_fields' && syncFromTarget && syncToTarget && (
          <SyncFieldsEditor
            operationId={operation.id}
            syncFromTarget={syncFromTarget}
            syncToTarget={syncToTarget}
            updateOperation={ruleEditorProps.updateOperation}
          />
        )}
        {!(mode === 'sync_fields' && syncFromTarget && syncToTarget) && (
          <>
            {(meta.from || meta.to !== undefined) && mode !== 'sync_fields' && (
              <div className='grid gap-3 sm:grid-cols-2'>
                {(meta.from || meta.to === false) && (
                  <div className='space-y-1.5'>
                    <label className='text-xs font-medium'>
                      {t(getModeFromLabel(mode))}
                    </label>
                    <Input
                      value={operation.from}
                      onChange={(e) =>
                        ruleEditorProps.updateOperation(operation.id, {
                          from: e.target.value,
                        })
                      }
                      placeholder={getModeFromPlaceholder(mode)}
                      className='h-9'
                    />
                  </div>
                )}
                {(meta.to || meta.to === false) && (
                  <div className='space-y-1.5'>
                    <label className='text-xs font-medium'>
                      {t(getModeToLabel(mode))}
                    </label>
                    <Input
                      value={operation.to}
                      onChange={(e) =>
                        ruleEditorProps.updateOperation(operation.id, {
                          to: e.target.value,
                        })
                      }
                      placeholder={getModeToPlaceholder(mode)}
                      className='h-9'
                    />
                  </div>
                )}
              </div>
            )}
            {!(
              (meta.from || meta.to !== undefined) &&
              mode !== 'sync_fields'
            ) && null}
          </>
        )}

        {/* Conditions */}
        <div className='rounded-lg border p-3'>
          <div className='mb-2 flex items-center justify-between'>
            <div className='flex items-center gap-2'>
              <span className='text-sm font-medium'>{t('Conditions')}</span>
              <Select
                items={[
                  { value: 'OR', label: t('Match Any (OR)') },
                  { value: 'AND', label: t('Match All (AND)') },
                ]}
                value={operation.logic || 'OR'}
                onValueChange={(v) =>
                  v !== null &&
                  ruleEditorProps.updateOperation(operation.id, {
                    logic: v,
                  })
                }
              >
                <SelectTrigger className='h-7 w-[120px] text-xs'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value='OR'>{t('Match Any (OR)')}</SelectItem>
                    <SelectItem value='AND'>{t('Match All (AND)')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className='flex items-center gap-1'>
              {conditions.length > 0 && (
                <>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='h-7 text-xs'
                    onClick={ruleEditorProps.expandAllConditions}
                  >
                    <ChevronDown className='mr-1 h-3 w-3' />
                    {t('Expand All')}
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='h-7 text-xs'
                    onClick={ruleEditorProps.collapseAllConditions}
                  >
                    <ChevronUp className='mr-1 h-3 w-3' />
                    {t('Collapse All')}
                  </Button>
                </>
              )}
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-7 text-xs'
                onClick={() => ruleEditorProps.addCondition(operation.id)}
              >
                <Plus className='mr-1 h-3 w-3' />
                {t('Add Condition')}
              </Button>
            </div>
          </div>

          {conditions.length === 0 ? (
            <p className='text-muted-foreground text-xs'>
              {t('When no conditions are set, the operation always executes.')}
            </p>
          ) : (
            <div className='space-y-2'>
              {conditions.map((condition, conditionIndex) => (
                <ConditionEditor
                  key={condition.id}
                  condition={condition}
                  conditionIndex={conditionIndex}
                  operationId={operation.id}
                  expanded={
                    ruleEditorProps.expandedConditions[condition.id] ?? false
                  }
                  onExpandedChange={(expanded) =>
                    ruleEditorProps.setExpandedConditions((prev) => ({
                      ...prev,
                      [condition.id]: expanded,
                    }))
                  }
                  updateCondition={ruleEditorProps.updateCondition}
                  removeCondition={ruleEditorProps.removeCondition}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  )
}
