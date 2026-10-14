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
import { GripVertical, Plus, Search } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { JsonCodeEditor } from '@/components/json-code-editor'
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
import { cn } from '@/lib/utils'

import { OPERATION_MODE_LABEL_MAP } from './param-override-definitions'
import { RuleEditor } from './param-override-rule-editor'
import { LEGACY_TEMPLATE, OPERATION_TEMPLATE } from './param-override-templates'
import {
  getModeTagTailwind,
  getOperationSummary,
} from './param-override-values'
import {
  type ParamOverrideEditorDialogProps,
  useParamOverrideEditor,
} from './use-param-override-editor'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ParamOverrideEditorDialog(
  props: ParamOverrideEditorDialogProps
) {
  const { t } = useTranslation()
  const {
    editMode,
    visualMode,
    legacyValue,
    setLegacyValue,
    operations,
    jsonText,
    jsonError,
    operationSearch,
    setOperationSearch,
    selectedOperationId,
    setSelectedOperationId,
    expandedConditions,
    setExpandedConditions,
    draggedOperationId,
    dragOverOperationId,
    dragOverPosition,
    templatePresetKey,
    setTemplatePresetKey,
    templatePresetOptions,
    operationCount,
    filteredOperations,
    selectedOperation,
    selectedOperationIndex,
    returnErrorDraft,
    pruneObjectsDraft,
    topOperationModes,
    updateOperation,
    addOperation,
    duplicateOperation,
    removeOperation,
    addCondition,
    updateCondition,
    removeCondition,
    updateReturnErrorDraft,
    updatePruneObjectsDraft,
    addPruneRule,
    updatePruneRule,
    removePruneRule,
    resetDragState,
    handleDragStart,
    handleDragOver,
    handleDrop,
    switchToJsonMode,
    switchToVisualMode,
    fillTemplate,
    resetEditorState,
    handleJsonChange,
    visualValidationError,
    handleSave,
    expandAllConditions,
    collapseAllConditions,
  } = useParamOverrideEditor(props)
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Parameter Override')}
      description={t(
        'Create request parameter override rules with a visual editor or raw JSON.'
      )}
      contentClassName='flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-5xl'
      headerClassName='border-b px-6 py-4'
      footerClassName='border-t px-6 py-4'
      contentHeight='min(72vh, 720px)'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='button' onClick={handleSave}>
            {t('Save')}
          </Button>
        </>
      }
    >
      {/* Toolbar */}
      <div className='bg-muted/30 border-b px-4 py-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-muted-foreground text-xs font-medium'>
            {t('Mode')}
          </span>
          <Button
            type='button'
            variant={editMode === 'visual' ? 'default' : 'outline'}
            size='sm'
            onClick={switchToVisualMode}
          >
            {t('Visual')}
          </Button>
          <Button
            type='button'
            variant={editMode === 'json' ? 'default' : 'outline'}
            size='sm'
            onClick={switchToJsonMode}
          >
            {t('JSON Text')}
          </Button>

          <div className='bg-border mx-1 h-5 w-px' />

          <span className='text-muted-foreground text-xs font-medium'>
            {t('Template')}
          </span>
          <Select
            items={templatePresetOptions.map((o) => ({
              value: o.value,
              label: t(o.label),
            }))}
            value={templatePresetKey}
            onValueChange={(v) =>
              setTemplatePresetKey(v || 'operations_default')
            }
          >
            <SelectTrigger className='h-8 w-[220px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {templatePresetOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.label)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => fillTemplate('fill')}
          >
            {t('Fill Template')}
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() => fillTemplate('append')}
          >
            {t('Append Template')}
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={resetEditorState}
          >
            {t('Reset')}
          </Button>
        </div>
      </div>
      {/* Content */}
      <div className='min-h-0 flex-1 overflow-hidden'>
        {
          <>
            {editMode === 'visual' && (
              <>
                {visualMode === 'legacy' && (
                  <div className='p-4'>
                    <p className='text-muted-foreground mb-2 text-sm'>
                      {t('Legacy Format (JSON Object)')}
                    </p>
                    <JsonCodeEditor
                      value={legacyValue}
                      onChange={setLegacyValue}
                      placeholder={JSON.stringify(LEGACY_TEMPLATE, null, 2)}
                      heightClassName='h-72 min-h-72 max-h-72'
                      ariaLabel={t('Legacy Format (JSON Object)')}
                    />
                    <p className='text-muted-foreground mt-2 text-xs'>
                      {t(
                        'Edit JSON object directly. Suitable for simple parameter overrides.'
                      )}
                    </p>
                  </div>
                )}
                {!(visualMode === 'legacy') && (
                  <div className='flex h-full'>
                    {/* Left sidebar */}
                    <div className='flex w-[280px] flex-shrink-0 flex-col border-r'>
                      <div className='flex items-center justify-between border-b px-3 py-2'>
                        <div className='flex items-center gap-2'>
                          <span className='text-sm font-medium'>
                            {t('Rules')}
                          </span>
                          <Badge variant='secondary'>
                            {operationCount}/{operations.length}
                          </Badge>
                        </div>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          onClick={addOperation}
                        >
                          <Plus className='h-4 w-4' />
                        </Button>
                      </div>

                      {topOperationModes.length > 0 && (
                        <div className='flex flex-wrap gap-1 border-b px-3 py-2'>
                          {topOperationModes.map(([mode, count]) => (
                            <span
                              key={`mode_stat_${mode}`}
                              className={cn(
                                'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                                getModeTagTailwind(mode)
                              )}
                            >
                              {t(OPERATION_MODE_LABEL_MAP[mode] || mode)} ·
                              {count}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className='px-3 py-2'>
                        <div className='relative'>
                          <Search className='text-muted-foreground absolute top-2.5 left-2.5 h-3.5 w-3.5' />
                          <Input
                            value={operationSearch}
                            onChange={(e) => setOperationSearch(e.target.value)}
                            placeholder={t('Search rules...')}
                            className='h-8 pl-8 text-xs'
                          />
                        </div>
                      </div>

                      <ScrollArea className='flex-1'>
                        <div className='flex flex-col gap-1 px-3 pb-3'>
                          {filteredOperations.length === 0 && (
                            <p className='text-muted-foreground py-4 text-center text-xs'>
                              {t('No matching rules')}
                            </p>
                          )}
                          {!(filteredOperations.length === 0) &&
                            filteredOperations.map((operation) => {
                              const index = operations.findIndex(
                                (o) => o.id === operation.id
                              )
                              const isActive =
                                operation.id === selectedOperationId
                              const isDragging =
                                operation.id === draggedOperationId
                              const isDropTarget =
                                operation.id === dragOverOperationId &&
                                draggedOperationId !== '' &&
                                draggedOperationId !== operation.id
                              return (
                                <div
                                  key={operation.id}
                                  role='button'
                                  tabIndex={0}
                                  draggable={operations.length > 1}
                                  onClick={() =>
                                    setSelectedOperationId(operation.id)
                                  }
                                  onDragStart={(e) =>
                                    handleDragStart(e, operation.id)
                                  }
                                  onDragOver={(e) =>
                                    handleDragOver(e, operation.id)
                                  }
                                  onDrop={(e) => handleDrop(e, operation.id)}
                                  onDragEnd={resetDragState}
                                  onKeyDown={(e: KeyboardEvent) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      setSelectedOperationId(operation.id)
                                    }
                                  }}
                                  className={cn(
                                    'cursor-pointer rounded-lg border p-2.5 transition-colors',
                                    isActive
                                      ? 'border-primary bg-primary/5'
                                      : 'hover:bg-muted/50',
                                    isDragging && 'opacity-50',
                                    isDropTarget &&
                                      dragOverPosition === 'before' &&
                                      'border-t-primary border-t-2',
                                    isDropTarget &&
                                      dragOverPosition === 'after' &&
                                      'border-b-primary border-b-2'
                                  )}
                                >
                                  <div className='flex items-start gap-2'>
                                    <GripVertical
                                      className={cn(
                                        'text-muted-foreground mt-0.5 h-3.5 w-3.5 flex-shrink-0',
                                        operations.length > 1
                                          ? 'cursor-grab'
                                          : 'cursor-default'
                                      )}
                                    />
                                    <div className='min-w-0 flex-1'>
                                      <div className='flex items-center justify-between gap-1'>
                                        <span className='text-xs font-semibold'>
                                          #{index + 1}
                                        </span>
                                        <Badge
                                          variant='outline'
                                          className='text-[10px]'
                                        >
                                          {operation.conditions.length}
                                        </Badge>
                                      </div>
                                      <p className='text-muted-foreground mt-0.5 line-clamp-1 text-[11px]'>
                                        {getOperationSummary(operation, index)}
                                      </p>
                                      {operation.description.trim() && (
                                        <p className='text-muted-foreground mt-0.5 line-clamp-2 text-[10px]'>
                                          {operation.description}
                                        </p>
                                      )}
                                      <span
                                        className={cn(
                                          'mt-1 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                                          getModeTagTailwind(
                                            operation.mode || 'set'
                                          )
                                        )}
                                      >
                                        {t(
                                          OPERATION_MODE_LABEL_MAP[
                                            operation.mode || 'set'
                                          ] ||
                                            operation.mode ||
                                            'set'
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* Right panel - Rule editor */}
                    <div className='flex min-w-0 flex-1 flex-col overflow-y-auto'>
                      {selectedOperation ? (
                        <RuleEditor
                          operation={selectedOperation}
                          operationIndex={selectedOperationIndex}
                          operations={operations}
                          returnErrorDraft={returnErrorDraft}
                          pruneObjectsDraft={pruneObjectsDraft}
                          expandedConditions={expandedConditions}
                          setExpandedConditions={setExpandedConditions}
                          updateOperation={updateOperation}
                          duplicateOperation={duplicateOperation}
                          removeOperation={removeOperation}
                          addCondition={addCondition}
                          updateCondition={updateCondition}
                          removeCondition={removeCondition}
                          updateReturnErrorDraft={updateReturnErrorDraft}
                          updatePruneObjectsDraft={updatePruneObjectsDraft}
                          addPruneRule={addPruneRule}
                          updatePruneRule={updatePruneRule}
                          removePruneRule={removePruneRule}
                          expandAllConditions={expandAllConditions}
                          collapseAllConditions={collapseAllConditions}
                        />
                      ) : (
                        <div className='flex flex-1 items-center justify-center'>
                          <p className='text-muted-foreground text-sm'>
                            {t('Select a rule to edit.')}
                          </p>
                        </div>
                      )}

                      {visualValidationError && (
                        <div className='border-t px-4 py-2'>
                          <p className='text-destructive text-xs'>
                            {visualValidationError}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            {!(editMode === 'visual') && (
              <div className='p-4'>
                <div className='mb-2 flex items-center gap-2'>
                  <span className='text-muted-foreground text-xs'>
                    {t('Advanced text editing')}
                  </span>
                </div>
                <JsonCodeEditor
                  value={jsonText}
                  onChange={handleJsonChange}
                  placeholder={JSON.stringify(OPERATION_TEMPLATE, null, 2)}
                  heightClassName='h-[420px] min-h-[420px] max-h-[420px]'
                  aria-invalid={Boolean(jsonError)}
                  ariaLabel={t('Advanced text editing')}
                />
                <p className='text-muted-foreground mt-2 text-xs'>
                  {t(
                    'Edit JSON text directly. Format will be validated on save.'
                  )}
                </p>
                {jsonError && (
                  <p className='text-destructive mt-1 text-xs'>{jsonError}</p>
                )}
              </div>
            )}
          </>
        }
      </div>
      {/* Footer */}
    </Dialog>
  )
}

export { type ParamOverrideEditorDialogProps } from './use-param-override-editor'
