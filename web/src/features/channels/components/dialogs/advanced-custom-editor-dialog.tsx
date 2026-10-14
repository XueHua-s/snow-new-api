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
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Code2,
  ListTree,
  Plus,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { JsonCodeEditor } from '@/components/json-code-editor'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  getAdvancedCustomIncomingPathLabel,
  stringifyAdvancedCustomConfig,
  replaceAdvancedCustomManagementRoute,
} from '../../lib/advanced-custom'
import {
  ADVANCED_CUSTOM_BALANCE_LABEL,
  ADVANCED_CUSTOM_BALANCE_PATH,
  ADVANCED_CUSTOM_MODEL_LIST_LABEL,
  ADVANCED_CUSTOM_MODEL_LIST_PATH,
} from '../../lib/advanced-custom-options'
import {
  ADVANCED_CUSTOM_TEMPLATE_OPTIONS,
  getAdvancedCustomTemplateConfig,
} from '../../lib/advanced-custom-templates'
import {
  longSelectContentClass,
  longSelectItemClass,
  RouteModeBadges,
} from './advanced-custom-editor-shared'
import { RouteGroupEditor } from './advanced-custom-group-editor'
import { ManagementRouteEditor } from './advanced-custom-management-editor'
import {
  type AdvancedCustomEditorDialogProps,
  useAdvancedCustomEditor,
  type AdvancedCustomEditorTab,
} from './use-advanced-custom-editor'

export function AdvancedCustomEditorDialog({
  open,
  value,
  onOpenChange,
  onSave,
}: AdvancedCustomEditorDialogProps) {
  const { t } = useTranslation()
  const {
    setConfig,
    activeTab,
    jsonText,
    jsonError,
    templateKey,
    templateConfirmOpen,
    setTemplateConfirmOpen,
    expandedRouteGroups,
    setExpandedRouteGroups,
    routeRows,
    routeGroups,
    usedIncomingPaths,
    availableIncomingPathOptions,
    validationError,
    canFixCatchAllOrder,
    modelListRoute,
    balanceRoute,
    selectedTemplate,
    updateRoute,
    addRoute,
    addRouteForIncomingPath,
    removeRoute,
    updateGroupIncomingPath,
    moveRouteWithinGroup,
    moveRouteToGroupEnd,
    fixCatchAllOrder,
    switchTab,
    handleJsonChange,
    selectTemplate,
    applySelectedTemplate,
    saveConfig,
  } = useAdvancedCustomEditor({ open, value, onOpenChange, onSave })
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Advanced Custom Routes')}
      description={t('Advanced Custom')}
      contentClassName='flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-5xl'
      headerClassName='border-b px-6 py-4'
      footerClassName='border-t px-6 py-4'
      contentHeight='70vh'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='button' onClick={saveConfig}>
            <Check data-icon='inline-start' />
            {t('Save changes')}
          </Button>
        </>
      }
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => switchTab(value as AdvancedCustomEditorTab)}
        className='min-w-0 gap-0'
      >
        <div className='border-b px-4 py-3'>
          <TabsList className='grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4'>
            <TabsTrigger value='forwarding'>
              <ListTree className='size-4' aria-hidden='true' />
              {t('Forwarding Routes')}
              <Badge variant='outline'>{routeRows.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value='models'>
              <ListTree className='size-4' aria-hidden='true' />
              {t('Model List')}
              <Badge variant='outline'>
                {modelListRoute ? t('Configured') : t('Not configured')}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value='balance'>
              <CircleDollarSign className='size-4' aria-hidden='true' />
              {t('Balance Query')}
              <Badge variant='outline'>
                {balanceRoute ? t('Configured') : t('Not configured')}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value='json'>
              <Code2 className='size-4' aria-hidden='true' />
              {t('Full JSON')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value='forwarding' className='flex flex-col gap-4 p-4'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <p className='font-medium'>{t('Forwarding Routes')}</p>
              <p className='text-muted-foreground text-xs'>
                {t('Add routes individually or replace them from a template.')}
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Select
                items={availableIncomingPathOptions}
                value={null}
                onValueChange={(incomingPath) => {
                  if (typeof incomingPath === 'string') addRoute(incomingPath)
                }}
              >
                <SelectTrigger
                  size='sm'
                  disabled={availableIncomingPathOptions.length === 0}
                >
                  <Plus data-icon='inline-start' />
                  <SelectValue placeholder={t('Add route')} />
                </SelectTrigger>
                <SelectContent
                  align='end'
                  alignItemWithTrigger={false}
                  className={longSelectContentClass}
                >
                  <SelectGroup>
                    {availableIncomingPathOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className={longSelectItemClass}
                      >
                        <div className='flex min-w-0 flex-col gap-1 leading-snug whitespace-normal'>
                          <span>{option.label}</span>
                          <span className='text-muted-foreground font-mono text-xs break-all'>
                            {option.value}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={null}
                onValueChange={(value) => {
                  if (typeof value === 'string') selectTemplate(value)
                }}
              >
                <SelectTrigger size='sm'>
                  <SelectValue placeholder={t('Add template')} />
                </SelectTrigger>
                <SelectContent align='end' alignItemWithTrigger={false}>
                  <SelectGroup>
                    {ADVANCED_CUSTOM_TEMPLATE_OPTIONS.map((template) => (
                      <SelectItem key={template.value} value={template.value}>
                        {t(template.label)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setExpandedRouteGroups(new Set())}
              >
                {t('Collapse all')}
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() =>
                  setExpandedRouteGroups(
                    new Set(routeGroups.map((group) => group.incomingPath))
                  )
                }
              >
                {t('Expand all')}
              </Button>
            </div>
          </div>

          {validationError ? (
            <Alert variant='destructive'>
              <AlertDescription className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <span>
                  {validationError.routeIndex !== undefined
                    ? `${t('Route')} ${validationError.routeIndex + 1}: `
                    : ''}
                  {t(validationError.message)}
                </span>
                {canFixCatchAllOrder ? (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={fixCatchAllOrder}
                  >
                    {t('Fix order')}
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className='flex flex-col gap-3'>
            {routeGroups.map((routeGroup) => (
              <Collapsible
                key={routeGroup.incomingPath || 'advanced-custom-empty-path'}
                open={expandedRouteGroups.has(routeGroup.incomingPath)}
                onOpenChange={(expanded) =>
                  setExpandedRouteGroups((current) => {
                    const next = new Set(current)
                    if (expanded) next.add(routeGroup.incomingPath)
                    else next.delete(routeGroup.incomingPath)
                    return next
                  })
                }
                className='rounded-md border'
              >
                <CollapsibleTrigger
                  render={
                    <button
                      type='button'
                      className='hover:bg-muted/50 focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left outline-none focus-visible:ring-3'
                    />
                  }
                >
                  {expandedRouteGroups.has(routeGroup.incomingPath) ? (
                    <ChevronDown
                      className='size-4 shrink-0'
                      aria-hidden='true'
                    />
                  ) : (
                    <ChevronRight
                      className='size-4 shrink-0'
                      aria-hidden='true'
                    />
                  )}
                  <span className='min-w-0 flex-1'>
                    <span className='flex min-w-0 flex-wrap items-center gap-2'>
                      <span className='truncate font-medium'>
                        {getAdvancedCustomIncomingPathLabel(
                          routeGroup.incomingPath
                        )}
                      </span>
                      <RouteModeBadges
                        routes={routeGroup.routeRows.map(
                          (routeRow) => routeRow.route
                        )}
                      />
                    </span>
                    <span className='text-muted-foreground block truncate font-mono text-xs'>
                      {routeGroup.incomingPath}
                    </span>
                  </span>
                  <Badge variant='outline'>
                    {routeGroup.routeRows.length} {t('Routes')}
                  </Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className='border-t'>
                  <RouteGroupEditor
                    group={routeGroup}
                    usedIncomingPaths={usedIncomingPaths}
                    validationError={validationError}
                    hideHeader
                    onAddRoute={() =>
                      addRouteForIncomingPath(routeGroup.incomingPath)
                    }
                    onIncomingPathChange={(nextIncomingPath) =>
                      updateGroupIncomingPath(routeGroup, nextIncomingPath)
                    }
                    onMoveRoute={(index, direction) =>
                      moveRouteWithinGroup(index, direction)
                    }
                    onMoveRouteToEnd={moveRouteToGroupEnd}
                    onRemoveRoute={removeRoute}
                    onRouteChange={updateRoute}
                  />
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </TabsContent>

        <TabsContent value='models' className='p-4'>
          <ManagementRouteEditor
            route={modelListRoute}
            path={ADVANCED_CUSTOM_MODEL_LIST_PATH}
            title={ADVANCED_CUSTOM_MODEL_LIST_LABEL}
            description={t(
              'This route is used only by channel management to discover upstream models.'
            )}
            onChange={(route) =>
              setConfig((current) =>
                replaceAdvancedCustomManagementRoute(
                  current,
                  ADVANCED_CUSTOM_MODEL_LIST_PATH,
                  route
                )
              )
            }
          />
        </TabsContent>

        <TabsContent value='balance' className='p-4'>
          <ManagementRouteEditor
            route={balanceRoute}
            path={ADVANCED_CUSTOM_BALANCE_PATH}
            title={ADVANCED_CUSTOM_BALANCE_LABEL}
            description={t(
              'This route is used only by channel management to query the upstream balance.'
            )}
            onChange={(route) =>
              setConfig((current) =>
                replaceAdvancedCustomManagementRoute(
                  current,
                  ADVANCED_CUSTOM_BALANCE_PATH,
                  route
                )
              )
            }
          />
        </TabsContent>

        <TabsContent value='json' className='p-4'>
          <JsonCodeEditor
            value={jsonText}
            onChange={handleJsonChange}
            placeholder={stringifyAdvancedCustomConfig(
              getAdvancedCustomTemplateConfig(templateKey)
            )}
            heightClassName='h-[420px] min-h-[420px] max-h-[420px]'
            aria-invalid={Boolean(jsonError)}
            ariaLabel={t('Advanced text editing')}
          />
          <p className='text-muted-foreground mt-2 text-xs'>
            {t('Edit JSON text directly. Format will be validated on save.')}
          </p>
          {jsonError ? (
            <p className='text-destructive mt-1 text-xs'>{jsonError}</p>
          ) : null}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={templateConfirmOpen}
        onOpenChange={setTemplateConfirmOpen}
        title={t('Replace forwarding routes?')}
        desc={t(
          'This will remove {{removed}} forwarding routes and replace them with the {{template}} template ({{created}} routes). Model list and balance routes will be preserved.',
          {
            removed: routeRows.length,
            created: selectedTemplate?.config.advanced_routes?.length || 0,
            template: selectedTemplate?.label || '',
          }
        )}
        confirmText={t('Replace')}
        handleConfirm={applySelectedTemplate}
      />
    </Dialog>
  )
}

export { RouteModeBadges } from './advanced-custom-editor-shared'
