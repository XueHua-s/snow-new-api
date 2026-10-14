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
import { ArrowRight, Shuffle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { ADVANCED_CUSTOM_CONVERTER_OPTIONS } from '../../lib/advanced-custom-options'
import type { AdvancedCustomConverter, AdvancedCustomRoute } from '../../types'

export const longSelectContentClass = 'w-[360px] max-w-[calc(100vw-2rem)]'

export const longSelectItemClass =
  'items-start py-2 [&_[data-slot=select-item-text]]:min-w-0 [&_[data-slot=select-item-text]]:shrink [&_[data-slot=select-item-text]]:whitespace-normal'

export const routeEditorGridClassName =
  'lg:grid-cols-[minmax(9rem,0.9fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.1fr)_minmax(0,0.85fr)_7rem]'

export const upstreamPathDescriptionKey =
  'Use a path to append it to the channel Base URL, or enter a full URL to override the Base URL for this route.'

export const catchAllOrderErrorMessage =
  'Catch-all route must be last for the same incoming path'

function getRouteConverterLabel(route: AdvancedCustomRoute): string {
  const converter = route.converter || 'none'
  return (
    ADVANCED_CUSTOM_CONVERTER_OPTIONS.find(
      (option) => option.value === converter
    )?.triggerLabel || converter
  )
}

function getRouteConverters(
  routes: AdvancedCustomRoute[]
): Array<{ converter: AdvancedCustomConverter; label: string }> {
  const converters = new Map<
    AdvancedCustomConverter,
    { converter: AdvancedCustomConverter; label: string }
  >()
  for (const route of routes) {
    const converter = route.converter || 'none'
    if (!converters.has(converter)) {
      converters.set(converter, {
        converter,
        label: getRouteConverterLabel(route),
      })
    }
  }
  return [...converters.values()]
}

export function RouteModeBadges(props: { routes: AdvancedCustomRoute[] }) {
  const { t } = useTranslation()
  return getRouteConverters(props.routes).map((item) => (
    <Badge
      key={item.converter}
      variant={item.converter === 'none' ? 'secondary' : 'outline'}
      className='max-w-full'
    >
      {item.converter === 'none' ? (
        <ArrowRight aria-hidden='true' />
      ) : (
        <Shuffle aria-hidden='true' />
      )}
      <span className='truncate'>{t(item.label)}</span>
    </Badge>
  ))
}

export function TooltipIconButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string
  icon: LucideIcon
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type='button'
              variant='ghost'
              size='icon'
              disabled={disabled}
              onClick={onClick}
            />
          }
        >
          <Icon data-icon='inline-start' aria-hidden='true' />
          <span className='sr-only'>{label}</span>
        </TooltipTrigger>
        <TooltipContent side='top'>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function FieldBlock({
  label,
  className,
  labelClassName,
  children,
}: {
  label: ReactNode
  className?: string
  labelClassName?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span className={cn('text-sm font-medium', labelClassName)}>{label}</span>
      {children}
    </div>
  )
}
