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
import { ChevronsUpDown, Check, CpuIcon } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

import type { GroupOption } from './group-selector'
import {
  modelGroupSelectorLayoutClasses,
  scrollSelectedOptionIntoView,
} from './model-group-selector/layout'
import type { ModelOption } from './model-selector'

// Export combined selector component
export interface ModelGroupSelectorProps {
  // Model props
  selectedModel: string
  models: ModelOption[]
  onModelChange: (value: string) => void
  // Group props
  selectedGroup: string
  groups: GroupOption[]
  onGroupChange: (value: string) => void
  // Common props
  className?: string
  disabled?: boolean
}

/**
 * Combined Model and Group Selector Component
 * Provides both model and group selection in a unified interface
 */
export const ModelGroupSelector: React.FC<ModelGroupSelectorProps> = ({
  selectedModel,
  models,
  onModelChange,
  selectedGroup,
  groups,
  onGroupChange,
  className,
  disabled = false,
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const isMobile = useIsMobile()
  const groupScrollContainerRef = useRef<HTMLDivElement | null>(null)
  const selectedGroupOptionRef = useRef<HTMLButtonElement | null>(null)
  const selectedModelOptionRef = useRef<HTMLDivElement | null>(null)

  const currentModel = useMemo(
    () => models.find((model) => model.value === selectedModel),
    [models, selectedModel]
  )
  const currentGroup = useMemo(
    () => groups.find((group) => group.value === selectedGroup),
    [groups, selectedGroup]
  )
  const filteredModels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return models
    }

    return models.filter((model) => {
      const searchableText = [
        model.label,
        model.value,
        model.description || '',
        model.category || '',
      ]
        .join(' ')
        .toLowerCase()

      return searchableText.includes(query)
    })
  }, [models, searchQuery])

  const handleModelChange = useCallback(
    (value: string) => {
      onModelChange(value)
      setOpen(false)
      setSearchQuery('')
    },
    [onModelChange]
  )

  const handleGroupChange = useCallback(
    (value: string) => {
      onGroupChange(value)
    },
    [onGroupChange]
  )

  useEffect(() => {
    if (!open) {
      return
    }

    let secondFrameId = 0
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        scrollSelectedOptionIntoView(
          selectedGroupOptionRef.current,
          groupScrollContainerRef.current
        )
        scrollSelectedOptionIntoView(selectedModelOptionRef.current)
      })
    })

    return () => {
      window.cancelAnimationFrame(firstFrameId)
      window.cancelAnimationFrame(secondFrameId)
    }
  }, [open, selectedGroup, selectedModel])

  const renderTrigger = () => (
    <Button
      aria-expanded={open}
      className={cn(
        'h-8 max-w-[15rem] justify-start gap-2 border px-2.5 font-medium shadow-none',
        'bg-background/80 hover:bg-accent/70 text-foreground',
        'focus:!ring-0 focus:!outline-none',
        className
      )}
      disabled={disabled}
      role='combobox'
      size='sm'
      variant='outline'
    >
      <CpuIcon className='text-muted-foreground size-4 shrink-0' />
      <span className='min-w-0 truncate text-xs'>
        {currentModel?.label || t('Model')}
      </span>
      <span className='bg-muted text-muted-foreground hidden max-w-20 shrink-0 rounded px-1.5 py-0.5 text-[10px] sm:inline-flex'>
        {currentGroup?.label || t('Group')}
      </span>
      <ChevronsUpDown className='text-muted-foreground ml-auto size-3.5 shrink-0 opacity-60' />
    </Button>
  )

  const renderGroupList = () => (
    <div
      className={cn(
        'min-w-0 space-y-2',
        !isMobile && modelGroupSelectorLayoutClasses.groupColumn
      )}
    >
      <div className='text-muted-foreground px-1 text-[11px] leading-4 font-medium'>
        {t('Model Group')}
      </div>
      <div
        className={cn(
          'grid gap-1',
          !isMobile && modelGroupSelectorLayoutClasses.groupScroll
        )}
        ref={groupScrollContainerRef}
      >
        {groups.map((group) => {
          const isSelected = selectedGroup === group.value

          return (
            <button
              className={cn(
                'flex min-w-0 items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[12px] leading-4 transition-colors',
                isSelected
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
              disabled={disabled}
              key={group.value}
              onClick={() => handleGroupChange(group.value)}
              ref={isSelected ? selectedGroupOptionRef : undefined}
              type='button'
            >
              <span className='min-w-0 truncate font-medium'>
                {group.label}
              </span>
              <Check
                className={cn(
                  'size-3.5 shrink-0',
                  isSelected ? 'opacity-100' : 'opacity-0'
                )}
              />
            </button>
          )
        })}
      </div>
    </div>
  )

  const renderModelList = () => (
    <Command
      className={cn(
        'min-w-0 rounded-lg border-0 bg-transparent p-1',
        !isMobile && modelGroupSelectorLayoutClasses.modelCommand
      )}
      filter={() => 1}
      shouldFilter={false}
    >
      <CommandInput
        className='h-8 text-[13px]'
        onValueChange={setSearchQuery}
        placeholder={t('Search models...')}
        value={searchQuery}
      />
      <CommandList
        className={
          isMobile ? 'max-h-[45vh]' : modelGroupSelectorLayoutClasses.modelList
        }
      >
        {filteredModels.length === 0 ? (
          <div className='text-muted-foreground px-3 py-8 text-center text-[12px] leading-5'>
            {t('No model found.')}
          </div>
        ) : (
          <CommandGroup className='p-1'>
            {filteredModels.map((model) => (
              <CommandItem
                className={cn(
                  modelGroupSelectorLayoutClasses.modelItem,
                  selectedModel === model.value
                    ? modelGroupSelectorLayoutClasses.selectedModelItem
                    : modelGroupSelectorLayoutClasses.unselectedModelItem
                )}
                key={model.value}
                onSelect={handleModelChange}
                ref={
                  selectedModel === model.value
                    ? selectedModelOptionRef
                    : undefined
                }
                value={model.value}
              >
                <span
                  className={cn(
                    'min-w-0 truncate',
                    selectedModel === model.value
                      ? modelGroupSelectorLayoutClasses.selectedModelText
                      : modelGroupSelectorLayoutClasses.unselectedModelText
                  )}
                >
                  {model.label}
                </span>
                <Check
                  className={cn(
                    'size-3.5 shrink-0',
                    selectedModel === model.value ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )

  const renderContent = () => (
    <div
      className={
        isMobile
          ? 'grid gap-3 p-2 md:grid-cols-[9.5rem_minmax(0,1fr)]'
          : modelGroupSelectorLayoutClasses.desktopContent
      }
    >
      {renderGroupList()}
      <div
        className={cn(
          'min-w-0 overflow-hidden rounded-lg border',
          !isMobile && modelGroupSelectorLayoutClasses.modelColumn
        )}
      >
        {renderModelList()}
      </div>
    </div>
  )

  return isMobile ? (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{renderTrigger()}</DrawerTrigger>
      <DrawerContent className='flex max-h-[80vh] min-h-[60vh] flex-col'>
        <DrawerHeader className='pb-3 text-left'>
          <DrawerTitle>{t('Select Model')}</DrawerTitle>
        </DrawerHeader>
        <div className='min-h-0 flex-1 overflow-y-auto px-4 pb-5'>
          {renderContent()}
        </div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={renderTrigger()} />
      <PopoverContent
        align='end'
        className={cn(
          'bg-popover z-50 w-[34rem] max-w-[calc(100vw-2rem)] rounded-xl border p-0 shadow-lg',
          modelGroupSelectorLayoutClasses.desktopPanel
        )}
        collisionPadding={8}
        side='top'
        sideOffset={8}
      >
        {renderContent()}
      </PopoverContent>
    </Popover>
  )
}

export { ModelSelector } from './model-selector'
export { GroupSelector } from './group-selector'
