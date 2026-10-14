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
  ArrowRight,
  HelpCircle,
  Sparkles,
  Copy,
  FileText,
  Eraser,
  Plus,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MultiSelect } from '@/components/multi-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import {
  FIELD_DESCRIPTIONS,
  FIELD_PLACEHOLDERS,
  MODEL_FETCHABLE_TYPES,
} from '../../constants'
import { ModelMappingEditor } from '../model-mapping-editor'
import {
  CHANNEL_EDITOR_SECTION_IDS,
  formatModelNames,
} from './channel-editor-state'
import { ChannelModelsSection } from './sections'
import type { useChannelEditor } from './use-channel-editor'

export function ChannelModelFields({
  form,
  currentModelsArray,
  modelOptions,
  handleModelsChange,
  modelMappingGuardrail,
  updateModels,
  handleFillRelatedModels,
  basicModels,
  handleFillAllModels,
  allModelsList,
  currentType,
  handleFetchModels,
  isEditing,
  canEditSensitive,
  handleCopyModels,
  handleClearModels,
  prefillGroups,
  handleAddPrefillGroup,
  mappingPreviewPairs,
  remainingMappingCount,
  isSubmitting,
  isLoadingGroups,
  groupOptions,
}: {
  form: ReturnType<typeof useChannelEditor>['form']
  currentModelsArray: ReturnType<typeof useChannelEditor>['currentModelsArray']
  modelOptions: ReturnType<typeof useChannelEditor>['modelOptions']
  handleModelsChange: ReturnType<typeof useChannelEditor>['handleModelsChange']
  modelMappingGuardrail: ReturnType<
    typeof useChannelEditor
  >['modelMappingGuardrail']
  updateModels: ReturnType<typeof useChannelEditor>['updateModels']
  handleFillRelatedModels: ReturnType<
    typeof useChannelEditor
  >['handleFillRelatedModels']
  basicModels: ReturnType<typeof useChannelEditor>['basicModels']
  handleFillAllModels: ReturnType<
    typeof useChannelEditor
  >['handleFillAllModels']
  allModelsList: ReturnType<typeof useChannelEditor>['allModelsList']
  currentType: ReturnType<typeof useChannelEditor>['currentType']
  handleFetchModels: ReturnType<typeof useChannelEditor>['handleFetchModels']
  isEditing: ReturnType<typeof useChannelEditor>['isEditing']
  canEditSensitive: ReturnType<typeof useChannelEditor>['canEditSensitive']
  handleCopyModels: ReturnType<typeof useChannelEditor>['handleCopyModels']
  handleClearModels: ReturnType<typeof useChannelEditor>['handleClearModels']
  prefillGroups: ReturnType<typeof useChannelEditor>['prefillGroups']
  handleAddPrefillGroup: ReturnType<
    typeof useChannelEditor
  >['handleAddPrefillGroup']
  mappingPreviewPairs: ReturnType<
    typeof useChannelEditor
  >['mappingPreviewPairs']
  remainingMappingCount: ReturnType<
    typeof useChannelEditor
  >['remainingMappingCount']
  isSubmitting: ReturnType<typeof useChannelEditor>['isSubmitting']
  isLoadingGroups: ReturnType<typeof useChannelEditor>['isLoadingGroups']
  groupOptions: ReturnType<typeof useChannelEditor>['groupOptions']
}) {
  const { t } = useTranslation()
  return (
    <div id={CHANNEL_EDITOR_SECTION_IDS.models} className='scroll-mt-4'>
      <ChannelModelsSection>
        <div className='space-y-5'>
          <div className='border-border/60 bg-muted/10 rounded-lg border p-4'>
            <FormField
              control={form.control}
              name='models'
              render={() => (
                <FormItem className='space-y-3'>
                  <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='space-y-1'>
                      <FormLabel>{t('Models *')}</FormLabel>
                      <FormDescription>
                        {t(FIELD_DESCRIPTIONS.MODELS)}
                      </FormDescription>
                    </div>
                    <Badge variant='outline' className='w-fit'>
                      {t('Selected {{count}}', {
                        count: currentModelsArray.length,
                      })}
                    </Badge>
                  </div>
                  <FormControl>
                    <MultiSelect
                      options={modelOptions}
                      selected={currentModelsArray}
                      onChange={handleModelsChange}
                      placeholder={t('Select models or add custom ones')}
                      allowCreate
                      createLabel='Add custom model "{{value}}"'
                      maxVisibleChips={8}
                      copyChipOnClick
                    />
                  </FormControl>
                  {modelMappingGuardrail.exposedTargetModels.length > 0 && (
                    <Alert className='border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50'>
                      <AlertDescription className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                        <span>
                          {t('The mapped upstream model(s)')}{' '}
                          {formatModelNames(
                            modelMappingGuardrail.exposedTargetModels
                          )}{' '}
                          {t(
                            'are also listed here. Remove them from Models to keep the `/v1/models` response user-friendly and hide vendor-specific names.'
                          )}
                        </span>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            const hiddenTargets = new Set(
                              modelMappingGuardrail.exposedTargetModels
                            )
                            updateModels(
                              currentModelsArray.filter(
                                (model) => !hiddenTargets.has(model)
                              )
                            )
                          }}
                        >
                          {t('Remove mapped targets')}
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator className='my-4' />

            <div className='space-y-3'>
              <div>
                <p className='text-sm font-medium'>{t('Quick actions')}</p>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Use presets or upstream discovery to populate the model list faster.'
                  )}
                </p>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleFillRelatedModels}
                  disabled={!basicModels.length}
                >
                  <FileText className='mr-2 h-4 w-4' aria-hidden='true' />
                  {t('Fill Related Models')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleFillAllModels}
                  disabled={!allModelsList.length}
                >
                  <Plus className='mr-2 h-4 w-4' aria-hidden='true' />
                  {t('Fill All Models')}
                </Button>
                {MODEL_FETCHABLE_TYPES.has(currentType) && (
                  <>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={handleFetchModels}
                      disabled={!isEditing && !canEditSensitive}
                    >
                      <Sparkles className='mr-2 h-4 w-4' aria-hidden='true' />
                      {t('Fetch from Upstream')}
                    </Button>
                    {!isEditing && !canEditSensitive && (
                      <span className='text-muted-foreground basis-full text-xs'>
                        {t('No permission to perform this action')}
                      </span>
                    )}
                  </>
                )}
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleCopyModels}
                  disabled={currentModelsArray.length === 0}
                >
                  <Copy className='mr-2 h-4 w-4' aria-hidden='true' />
                  {t('Copy All')}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={handleClearModels}
                  disabled={currentModelsArray.length === 0}
                >
                  <Eraser className='mr-2 h-4 w-4' aria-hidden='true' />
                  {t('Clear All')}
                </Button>
              </div>
              {prefillGroups.length > 0 && (
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-muted-foreground text-xs'>
                    {t('Preset groups')}:
                  </span>
                  {prefillGroups.map((group) => (
                    <Button
                      key={group.id}
                      type='button'
                      variant='secondary'
                      size='sm'
                      onClick={() => handleAddPrefillGroup(group)}
                    >
                      {group.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className='border-border/60 rounded-lg border p-4'>
            <FormField
              control={form.control}
              name='model_mapping'
              render={({ field }) => (
                <FormItem className='space-y-3'>
                  <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
                    <div className='space-y-1'>
                      <div className='flex items-center gap-2'>
                        <FormLabel className='mb-0'>
                          {t('Model Mapping')}
                        </FormLabel>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon-sm'
                                className='text-muted-foreground hover:text-foreground size-auto p-0'
                                aria-label={t('How model mapping works')}
                              />
                            }
                          >
                            <HelpCircle
                              className='h-4 w-4'
                              aria-hidden='true'
                            />
                          </TooltipTrigger>
                          <TooltipContent
                            side='top'
                            align='start'
                            className='max-w-xs space-y-2 text-left'
                          >
                            <p className='text-xs font-semibold tracking-wide uppercase'>
                              {t('Request flow')}
                            </p>
                            <div className='space-y-1 font-mono text-xs'>
                              {mappingPreviewPairs.map((pair) => (
                                <div
                                  key={`${pair.source}-${pair.target}`}
                                  className='flex items-center gap-1'
                                >
                                  <span>{pair.source}</span>
                                  <ArrowRight
                                    className='h-3.5 w-3.5 opacity-70'
                                    aria-hidden='true'
                                  />
                                  <span>{pair.target}</span>
                                </div>
                              ))}
                              {remainingMappingCount > 0 && (
                                <div className='text-[11px] opacity-70'>
                                  +{remainingMappingCount} {t('more mapping')}
                                  {remainingMappingCount > 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                            <p className='text-[11px] leading-relaxed opacity-80'>
                              {t(
                                'Users call the model on the left. The platform forwards the request to the upstream model on the right.'
                              )}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormDescription>
                        {t(FIELD_DESCRIPTIONS.MODEL_MAPPING)}
                      </FormDescription>
                    </div>
                  </div>
                  <FormControl>
                    <ModelMappingEditor
                      value={field.value || ''}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                      sourceModelOptions={currentModelsArray}
                      targetModelOptions={modelOptions.map(
                        (option) => option.value
                      )}
                    />
                  </FormControl>
                  {modelMappingGuardrail.invalidJson && (
                    <Alert variant='destructive'>
                      <AlertDescription>
                        {t('Model Mapping must be a JSON object like')}{' '}
                        <code className='font-mono'>
                          {'{"gpt-4":"Azure-GPT4"}'}
                        </code>
                        {t('. Please fix the JSON before saving.')}
                      </AlertDescription>
                    </Alert>
                  )}
                  {modelMappingGuardrail.missingSourceModels.length > 0 && (
                    <Alert className='border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-50'>
                      <AlertDescription className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                        <span>
                          {t('Add')}{' '}
                          {formatModelNames(
                            modelMappingGuardrail.missingSourceModels
                          )}{' '}
                          {t(
                            'to the Models list so users can use them before the mapping sends traffic upstream.'
                          )}
                        </span>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => {
                            updateModels([
                              ...currentModelsArray,
                              ...modelMappingGuardrail.missingSourceModels,
                            ])
                          }}
                        >
                          {t('Add missing models')}
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='border-border/60 rounded-lg border p-4'>
            <FormField
              control={form.control}
              name='group'
              render={({ field }) => (
                <FormItem className='space-y-3'>
                  <div className='space-y-1'>
                    <FormLabel>{t('Groups *')}</FormLabel>
                    <FormDescription>
                      {t(FIELD_DESCRIPTIONS.GROUP)}
                    </FormDescription>
                  </div>
                  <FormControl>
                    {isLoadingGroups ? (
                      <Skeleton className='h-10 w-full' />
                    ) : (
                      <MultiSelect
                        options={groupOptions}
                        selected={field.value}
                        onChange={field.onChange}
                        placeholder={t(FIELD_PLACEHOLDERS.GROUP)}
                      />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </ChannelModelsSection>
    </div>
  )
}
