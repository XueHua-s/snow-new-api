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
import { ArrowDown, ArrowDownToLine, ArrowUp, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import {
  buildAdvancedCustomAuth,
  getAdvancedCustomAuthMode,
  getAdvancedCustomConverterDefaults,
  getAdvancedCustomConverterOptions,
  getAdvancedCustomUpstreamPathPlaceholder,
  getDefaultAdvancedCustomIncomingPath,
  isAdvancedCustomIncomingPathAllowed,
} from '../../lib/advanced-custom'
import {
  getAdvancedCustomModelRuleKind,
  getAdvancedCustomRegexModelPattern,
  parseAdvancedCustomRouteModels,
} from '../../lib/advanced-custom-model-rules'
import {
  ADVANCED_CUSTOM_AUTH_MODE_OPTIONS,
  ADVANCED_CUSTOM_CONVERTER_OPTIONS,
  ADVANCED_CUSTOM_MODEL_LIST_LABEL,
  ADVANCED_CUSTOM_MODEL_LIST_PATH,
  type AdvancedCustomAuthMode,
} from '../../lib/advanced-custom-options'
import type {
  AdvancedCustomAuthType,
  AdvancedCustomConverter,
  AdvancedCustomRoute,
} from '../../types'
import {
  routeEditorGridClassName,
  RouteModeBadges,
  TooltipIconButton,
  FieldBlock,
  upstreamPathDescriptionKey,
  longSelectContentClass,
  longSelectItemClass,
} from './advanced-custom-editor-shared'
import { ModelRuleHelpPopover } from './advanced-custom-model-help'
import { getOptionLabel } from './advanced-route-groups'

export function RouteEditor({
  route,
  index,
  errorMessage,
  canMoveUp,
  canMoveDown,
  catchAllOutOfOrder,
  onChange,
  onMoveUp,
  onMoveDown,
  onMoveCatchAllToEnd,
  onRemove,
}: {
  route: AdvancedCustomRoute
  index: number
  errorMessage?: string
  canMoveUp: boolean
  canMoveDown: boolean
  catchAllOutOfOrder: boolean
  onChange: (patch: Partial<AdvancedCustomRoute>) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onMoveCatchAllToEnd: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const converter = route.converter || 'none'
  const authMode = getAdvancedCustomAuthMode(route)
  const incomingPath =
    route.incoming_path || getDefaultAdvancedCustomIncomingPath(converter)
  const isModelListRoute = incomingPath === ADVANCED_CUSTOM_MODEL_LIST_PATH
  const converterOptions = useMemo(
    () => getAdvancedCustomConverterOptions(incomingPath),
    [incomingPath]
  )
  const converterTriggerLabel =
    ADVANCED_CUSTOM_CONVERTER_OPTIONS.find(
      (option) => option.value === converter
    )?.triggerLabel || converter
  const authLabel = getOptionLabel(ADVANCED_CUSTOM_AUTH_MODE_OPTIONS, authMode)
  const modelsInputValue = route.models?.join(', ') || ''
  const parsedRouteModels = parseAdvancedCustomRouteModels(modelsInputValue)
  const isFallback = !isModelListRoute && parsedRouteModels.length === 0

  const setConverter = (nextConverter: AdvancedCustomConverter) => {
    let nextIncomingPath = incomingPath
    if (!isAdvancedCustomIncomingPathAllowed(nextIncomingPath, nextConverter)) {
      nextIncomingPath = getDefaultAdvancedCustomIncomingPath(nextConverter)
    }
    const defaults = getAdvancedCustomConverterDefaults(
      nextConverter,
      nextIncomingPath
    )
    onChange({
      converter: nextConverter,
      incoming_path: nextIncomingPath,
      upstream_path: defaults.upstream_path,
      auth: defaults.auth,
    })
  }

  const setAuthMode = (mode: AdvancedCustomAuthMode) => {
    onChange({ auth: buildAdvancedCustomAuth(mode, route.auth) })
  }

  const setModelsInput = (value: string) => {
    onChange({
      models: value === '' ? [] : value.split(','),
    })
  }

  const normalizeModelsInput = (value: string) => {
    onChange({ models: parseAdvancedCustomRouteModels(value) })
  }

  const updateAuth = (
    field: Exclude<keyof NonNullable<AdvancedCustomRoute['auth']>, 'type'>,
    value: string
  ) => {
    const currentAuth = route.auth
    if (!currentAuth || currentAuth.type === 'none') return
    onChange({
      auth: {
        type: currentAuth.type as AdvancedCustomAuthType,
        name: currentAuth.name || '',
        value: currentAuth.value || '',
        [field]: value,
      },
    })
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-4 px-4 py-4 lg:gap-2 lg:px-3 lg:py-3',
        errorMessage && 'bg-destructive/5'
      )}
    >
      <div
        className={cn(
          'grid gap-4 md:grid-cols-2 lg:items-center lg:gap-2',
          routeEditorGridClassName
        )}
      >
        <div className='flex min-w-0 items-start justify-between gap-3 md:col-span-2 lg:col-span-1'>
          <div className='min-w-0 space-y-2'>
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <div className='text-sm font-medium'>
                {t('Route')} {index + 1}
              </div>
              {isModelListRoute ? (
                <Badge variant='outline'>
                  {ADVANCED_CUSTOM_MODEL_LIST_LABEL}
                </Badge>
              ) : null}
              {!isModelListRoute && isFallback ? (
                <Badge variant='outline'>{t('Fallback')}</Badge>
              ) : null}
              <RouteModeBadges routes={[route]} />
            </div>
          </div>
          <div className='flex shrink-0 items-center gap-1 lg:hidden'>
            <TooltipIconButton
              label={t('Move route up')}
              icon={ArrowUp}
              disabled={!canMoveUp}
              onClick={onMoveUp}
            />
            <TooltipIconButton
              label={t('Move route down')}
              icon={ArrowDown}
              disabled={!canMoveDown}
              onClick={onMoveDown}
            />
            {catchAllOutOfOrder ? (
              <TooltipIconButton
                label={t('Move fallback to end')}
                icon={ArrowDownToLine}
                onClick={onMoveCatchAllToEnd}
              />
            ) : null}
            <TooltipIconButton
              label={t('Delete')}
              icon={Trash2}
              onClick={onRemove}
            />
          </div>
        </div>

        <FieldBlock
          label={
            <span className='inline-flex items-center gap-1'>
              {t('Client model')}
              <ModelRuleHelpPopover />
            </span>
          }
          className='lg:gap-1'
          labelClassName='lg:sr-only'
        >
          {isModelListRoute && parsedRouteModels.length === 0 ? (
            <div className='flex h-9 items-center'>
              <Badge variant='outline'>
                {ADVANCED_CUSTOM_MODEL_LIST_LABEL}
              </Badge>
            </div>
          ) : (
            <>
              <Input
                value={modelsInputValue}
                onChange={(event) => setModelsInput(event.target.value)}
                onBlur={(event) => normalizeModelsInput(event.target.value)}
                placeholder={
                  isFallback
                    ? t('Leave empty for fallback')
                    : t('e.g. gpt-4o, gemini-2.5-flash')
                }
                aria-invalid={Boolean(errorMessage)}
              />
              <div className='flex flex-wrap gap-1'>
                {isFallback ? (
                  <Badge variant='outline'>{t('Fallback')}</Badge>
                ) : (
                  parsedRouteModels.map((model) => {
                    const ruleKind = getAdvancedCustomModelRuleKind(model)
                    const displayModel =
                      ruleKind === 'regex'
                        ? getAdvancedCustomRegexModelPattern(model) || model
                        : model
                    return (
                      <Badge
                        key={model}
                        variant={ruleKind === 'regex' ? 'outline' : 'secondary'}
                        className='max-w-full gap-1.5 font-mono'
                      >
                        <span className='font-sans text-[10px] font-semibold tracking-normal uppercase'>
                          {t(ruleKind === 'regex' ? 'Regex' : 'Exact')}
                        </span>
                        <span className='truncate'>{displayModel}</span>
                      </Badge>
                    )
                  })
                )}
              </div>
            </>
          )}
        </FieldBlock>

        <FieldBlock
          label={t('Upstream path')}
          className='lg:gap-1'
          labelClassName='lg:sr-only'
        >
          <Input
            value={route.upstream_path || ''}
            onChange={(event) =>
              onChange({
                upstream_path: event.target.value,
              })
            }
            placeholder={getAdvancedCustomUpstreamPathPlaceholder(
              converter,
              incomingPath
            )}
          />
          <p className='text-muted-foreground text-xs leading-relaxed lg:hidden'>
            {t(upstreamPathDescriptionKey)}
          </p>
        </FieldBlock>

        <FieldBlock
          label={t('Converter')}
          className='lg:gap-1'
          labelClassName='lg:sr-only'
        >
          <Select
            value={converter}
            disabled={isModelListRoute && converter === 'none'}
            onValueChange={(value) =>
              setConverter(value as AdvancedCustomConverter)
            }
          >
            <SelectTrigger className='w-full max-w-full lg:h-8'>
              <SelectValue className='min-w-0 truncate'>
                {t(converterTriggerLabel)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              alignItemWithTrigger={false}
              className={longSelectContentClass}
            >
              <SelectGroup>
                {converterOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className={longSelectItemClass}
                  >
                    <span className='min-w-0 leading-snug break-words whitespace-normal'>
                      {t(option.label)}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FieldBlock>

        <FieldBlock
          label={t('Auth')}
          className='lg:gap-1'
          labelClassName='lg:sr-only'
        >
          <Select
            value={authMode}
            onValueChange={(value) =>
              setAuthMode(value as AdvancedCustomAuthMode)
            }
          >
            <SelectTrigger className='w-full max-w-full lg:h-8'>
              <SelectValue className='min-w-0 truncate'>
                {t(authLabel)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {ADVANCED_CUSTOM_AUTH_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.label)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FieldBlock>

        <div className='hidden items-center justify-end gap-1 lg:flex'>
          <TooltipIconButton
            label={t('Move route up')}
            icon={ArrowUp}
            disabled={!canMoveUp}
            onClick={onMoveUp}
          />
          <TooltipIconButton
            label={t('Move route down')}
            icon={ArrowDown}
            disabled={!canMoveDown}
            onClick={onMoveDown}
          />
          {catchAllOutOfOrder ? (
            <TooltipIconButton
              label={t('Move fallback to end')}
              icon={ArrowDownToLine}
              onClick={onMoveCatchAllToEnd}
            />
          ) : null}
          <TooltipIconButton
            label={t('Delete')}
            icon={Trash2}
            onClick={onRemove}
          />
        </div>
      </div>

      {errorMessage ? (
        <p className='text-destructive text-xs'>{t(errorMessage)}</p>
      ) : null}

      {authMode === 'header' || authMode === 'query' ? (
        <>
          <Separator className='lg:hidden' />
          <div
            className={cn(
              'grid gap-4 md:grid-cols-2 lg:items-end lg:gap-2 lg:border-t lg:pt-2',
              routeEditorGridClassName
            )}
          >
            <span className='hidden lg:block' aria-hidden='true' />
            <FieldBlock
              label={t('Auth name')}
              className='lg:gap-1'
              labelClassName='lg:text-xs'
            >
              <Input
                value={route.auth?.name || ''}
                onChange={(event) => updateAuth('name', event.target.value)}
                placeholder={
                  authMode === 'header' ? 'Authorization' : 'api_key'
                }
              />
            </FieldBlock>
            <FieldBlock
              label={t('Auth value')}
              className='lg:gap-1'
              labelClassName='lg:text-xs'
            >
              <Input
                value={route.auth?.value || ''}
                onChange={(event) => updateAuth('value', event.target.value)}
                placeholder={
                  authMode === 'header' ? 'Bearer {api_key}' : '{api_key}'
                }
              />
            </FieldBlock>
            <span className='hidden lg:block' aria-hidden='true' />
            <span className='hidden lg:block' aria-hidden='true' />
            <span className='hidden lg:block' aria-hidden='true' />
          </div>
        </>
      ) : null}
    </div>
  )
}
