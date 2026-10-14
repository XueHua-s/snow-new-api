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
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { getAdvancedCustomIncomingPathLabel } from '../../lib/advanced-custom'
import {
  ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS,
  ADVANCED_CUSTOM_MODEL_LIST_LABEL,
  ADVANCED_CUSTOM_MODEL_LIST_PATH,
} from '../../lib/advanced-custom-options'
import type { validateAdvancedCustomConfig } from '../../lib/advanced-custom-validation'
import type { AdvancedCustomRoute } from '../../types'
import {
  longSelectContentClass,
  longSelectItemClass,
  routeEditorGridClassName,
} from './advanced-custom-editor-shared'
import { ModelRuleHelpPopover } from './advanced-custom-model-help'
import { RouteEditor } from './advanced-custom-route-editor'
import {
  type AdvancedCustomRouteGroup,
  isCatchAllRoute,
} from './advanced-route-groups'

export function RouteGroupEditor({
  group,
  usedIncomingPaths,
  validationError,
  hideHeader = false,
  onAddRoute,
  onIncomingPathChange,
  onMoveRoute,
  onMoveRouteToEnd,
  onRemoveRoute,
  onRouteChange,
}: {
  group: AdvancedCustomRouteGroup
  usedIncomingPaths: ReadonlySet<string>
  validationError: ReturnType<typeof validateAdvancedCustomConfig>
  hideHeader?: boolean
  onAddRoute: () => void
  onIncomingPathChange: (incomingPath: string | null) => void
  onMoveRoute: (index: number, direction: -1 | 1) => void
  onMoveRouteToEnd: (index: number) => void
  onRemoveRoute: (index: number) => void
  onRouteChange: (index: number, patch: Partial<AdvancedCustomRoute>) => void
}) {
  const { t } = useTranslation()
  const incomingPath = group.incomingPath || '/v1/chat/completions'
  const isModelListGroup = incomingPath === ADVANCED_CUSTOM_MODEL_LIST_PATH
  const incomingPathLabel = getAdvancedCustomIncomingPathLabel(incomingPath)
  const catchAllRoute = group.routeRows.find((routeRow) =>
    isCatchAllRoute(routeRow.route)
  )
  const catchAllRoutePosition = catchAllRoute
    ? group.routeRows.findIndex(
        (routeRow) => routeRow.index === catchAllRoute.index
      )
    : -1
  const hasCatchAll = catchAllRoute !== undefined
  const catchAllIsLast =
    !hasCatchAll || catchAllRoutePosition === group.routeRows.length - 1
  const groupHasError =
    validationError?.routeIndex !== undefined &&
    group.routeRows.some(
      (routeRow) => routeRow.index === validationError.routeIndex
    )

  return (
    <section
      className={cn(
        'border-border overflow-hidden rounded-md border',
        groupHasError && 'border-destructive/60'
      )}
    >
      {!hideHeader ? (
        <div className='bg-muted/20 flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex min-w-0 flex-1 flex-col gap-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-sm font-medium'>{t('Route group')}</span>
              <Badge variant='secondary'>
                {group.routeRows.length} {t('Routes')}
              </Badge>
              {isModelListGroup ? (
                <Badge variant='outline'>
                  {ADVANCED_CUSTOM_MODEL_LIST_LABEL}
                </Badge>
              ) : (
                <Badge variant={hasCatchAll ? 'outline' : 'secondary'}>
                  {hasCatchAll ? t('Fallback route') : t('Model-scoped only')}
                </Badge>
              )}
              {!isModelListGroup && !catchAllIsLast ? (
                <Badge variant='destructive'>
                  {t('Fallback must be last')}
                </Badge>
              ) : null}
            </div>
            <Select
              items={ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS}
              value={incomingPath}
              onValueChange={onIncomingPathChange}
            >
              <SelectTrigger className='h-9 max-w-full lg:max-w-[420px]'>
                <SelectValue className='min-w-0 truncate'>
                  {incomingPathLabel}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                alignItemWithTrigger={false}
                className={longSelectContentClass}
              >
                <SelectGroup>
                  {ADVANCED_CUSTOM_INCOMING_PATH_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      disabled={
                        (option.value !== incomingPath &&
                          usedIncomingPaths.has(option.value)) ||
                        (option.value === ADVANCED_CUSTOM_MODEL_LIST_PATH &&
                          group.routeRows.length > 1)
                      }
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
          </div>

          {!isModelListGroup ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={onAddRoute}
            >
              <Plus data-icon='inline-start' />
              {t('Add split')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className={cn('px-3 py-2', !hideHeader && 'border-t')}>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {isModelListGroup
            ? t(
                'This route discovers upstream OpenAI models and cannot be split or matched by client model rules.'
              )
            : t(
                'Routes with the same incoming path are split by client model rules. Unmatched requests use the final fallback.'
              )}
        </p>
        {groupHasError && validationError ? (
          <p className='text-destructive mt-1 text-xs'>
            {validationError.routeIndex !== undefined
              ? `${t('Route')} ${validationError.routeIndex + 1}: `
              : ''}
            {t(validationError.message)}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          'text-muted-foreground hidden items-center gap-2 border-t bg-muted/10 px-3 py-2 text-xs font-medium lg:grid',
          routeEditorGridClassName
        )}
      >
        <span>{t('Route')}</span>
        <span className='inline-flex items-center gap-1'>
          {t('Client model')}
          <ModelRuleHelpPopover />
        </span>
        <span>{t('Upstream path')}</span>
        <span>{t('Converter')}</span>
        <span>{t('Auth')}</span>
        <span className='text-right'>{t('Actions')}</span>
      </div>

      <div className='divide-y'>
        {group.routeRows.map((routeRow, position) => {
          const canMoveUp = position > 0
          const canMoveDown = position < group.routeRows.length - 1
          const catchAllOutOfOrder =
            isCatchAllRoute(routeRow.route) && canMoveDown
          const routeErrorMessage =
            validationError?.routeIndex === routeRow.index
              ? validationError.message
              : undefined

          return (
            <RouteEditor
              key={routeRow.routeKey}
              route={routeRow.route}
              index={routeRow.index}
              errorMessage={routeErrorMessage}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              catchAllOutOfOrder={catchAllOutOfOrder}
              onChange={(patch) => onRouteChange(routeRow.index, patch)}
              onMoveDown={() => onMoveRoute(routeRow.index, 1)}
              onMoveUp={() => onMoveRoute(routeRow.index, -1)}
              onMoveCatchAllToEnd={() => onMoveRouteToEnd(routeRow.index)}
              onRemove={() => onRemoveRoute(routeRow.index)}
            />
          )
        })}
      </div>
    </section>
  )
}
