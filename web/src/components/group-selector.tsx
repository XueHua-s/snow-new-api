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
import { ChevronsUpDown, Check, LayersIcon } from 'lucide-react'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
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

export interface GroupOption {
  label: string
  value: string
  ratio?: number
  desc?: string
  description?: string
}

interface GroupSelectorProps {
  selectedGroup: string
  groups: GroupOption[]
  onGroupChange: (value: string) => void
  className?: string
  disabled?: boolean
}

const GroupTriggerButton = React.forwardRef<
  React.ComponentRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button> & {
    currentLabel: string
    triggerClassName?: string
    isDisabled?: boolean
  }
>(({ currentLabel, triggerClassName, isDisabled, ...props }, ref) => (
  <Button
    ref={ref}
    variant='outline'
    role='combobox'
    size='sm'
    disabled={isDisabled}
    className={cn(
      'flex h-8 items-center gap-2 border px-3 font-medium',
      'justify-center p-0 sm:w-auto sm:justify-start sm:px-3',
      'w-8',
      'bg-background text-foreground',
      'hover:bg-accent transition-colors',
      'focus:!ring-0 focus:!outline-none',
      'shadow-none',
      triggerClassName
    )}
    {...props}
  >
    <LayersIcon className='text-muted-foreground block size-4 sm:hidden' />
    <span className='text-muted-foreground sm:text-foreground hidden truncate text-xs sm:block'>
      {currentLabel}
    </span>
    <ChevronsUpDown className='text-muted-foreground hidden h-4 w-4 opacity-50 sm:block' />
  </Button>
))

GroupTriggerButton.displayName = 'GroupTriggerButton'

/**
 * Group Selector Component
 * Styled following Scira's form-component design patterns
 */
export const GroupSelector: React.FC<GroupSelectorProps> = React.memo(
  ({ selectedGroup, groups, onGroupChange, className, disabled = false }) => {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const isMobile = useIsMobile()

    const currentGroup = useMemo(
      () => groups.find((g) => g.value === selectedGroup),
      [groups, selectedGroup]
    )

    const handleGroupChange = useCallback(
      (value: string) => {
        onGroupChange(value)
        setOpen(false)
      },
      [onGroupChange]
    )

    // Shared command content
    const renderGroupCommandContent = () => (
      <Command
        className={cn(
          isMobile
            ? 'h-full flex-1 rounded-lg border-0 bg-transparent'
            : 'rounded-lg'
        )}
        filter={(value, search) => {
          const group = groups.find((g) => g.value === value)
          if (!group || !search) return 1

          const searchTerm = search.toLowerCase()
          const searchableFields = [
            group.label,
            group.description || '',
            group.value,
          ]
            .join(' ')
            .toLowerCase()

          return searchableFields.includes(searchTerm) ? 1 : 0
        }}
      >
        <CommandInput placeholder={t('Search groups...')} className='h-9' />
        <CommandEmpty>{t('No group found.')}</CommandEmpty>
        <CommandList
          className={isMobile ? '!max-h-full flex-1 p-2' : 'max-h-[240px]'}
        >
          <CommandGroup>
            <div className='text-muted-foreground px-2 py-1 text-[10px] font-medium'>
              {t('Model Group')}
            </div>
            {groups.map((group) => (
              <CommandItem
                key={group.value}
                value={group.value}
                onSelect={handleGroupChange}
                className={cn(
                  'mb-0.5 flex items-center justify-between rounded-lg px-2 py-2 text-xs',
                  'transition-all duration-200',
                  'hover:bg-accent',
                  'data-[selected=true]:bg-accent'
                )}
              >
                <div className='flex min-w-0 flex-1 items-center gap-2 pr-4'>
                  <div className='flex min-w-0 flex-1 flex-col'>
                    <span className='text-foreground truncate text-[11px] font-medium'>
                      {group.label}
                    </span>
                    {(group.desc || group.description) && (
                      <div className='text-muted-foreground truncate text-[9px] leading-tight'>
                        {group.desc || group.description}
                        {group.ratio && (
                          <>
                            {' · '}
                            {t('Ratio: {{value}}', { value: group.ratio })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <Check
                  className={cn(
                    'ml-auto h-4 w-4',
                    selectedGroup === group.value ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    )

    return isMobile ? (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <GroupTriggerButton
            currentLabel={currentGroup?.label || t('Group')}
            triggerClassName={className}
            isDisabled={disabled}
            aria-expanded={open}
          />
        </DrawerTrigger>
        <DrawerContent className='max-h-[80vh]'>
          <DrawerHeader className='pb-4 text-left'>
            <DrawerTitle>{t('Choose Group')}</DrawerTitle>
          </DrawerHeader>
          <div className='max-h-[calc(80vh-100px)] overflow-y-auto px-4 pb-6'>
            <div className='space-y-2'>
              {groups.map((group) => (
                <Button
                  key={group.value}
                  variant='outline'
                  onClick={() => handleGroupChange(group.value)}
                  className={cn(
                    'flex h-auto w-full items-center justify-between rounded-lg p-4 text-left whitespace-normal',
                    'border-border hover:bg-accent',
                    selectedGroup === group.value
                      ? 'bg-accent border-primary/20'
                      : 'bg-background'
                  )}
                >
                  <div className='flex min-w-0 flex-1 items-center gap-3'>
                    <div className='flex min-w-0 flex-1 flex-col'>
                      <span className='text-foreground text-sm font-medium'>
                        {group.label}
                      </span>
                      {(group.desc || group.description) && (
                        <div className='text-muted-foreground mt-0.5 text-xs'>
                          {group.desc || group.description}
                          {group.ratio && (
                            <>
                              {' · '}
                              {t('Ratio: {{value}}', {
                                value: group.ratio,
                              })}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Check
                    className={cn(
                      'ml-3 h-5 w-5 shrink-0',
                      selectedGroup === group.value
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                </Button>
              ))}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    ) : (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <GroupTriggerButton
              currentLabel={currentGroup?.label || t('Group')}
              triggerClassName={className}
              isDisabled={disabled}
              aria-expanded={open}
            />
          }
        />
        <PopoverContent
          className='bg-popover z-50 w-[90vw] max-w-[14em] rounded-lg border p-0 !shadow-none sm:w-[14em]'
          align='start'
          side='bottom'
          sideOffset={4}
          collisionPadding={8}
        >
          {renderGroupCommandContent()}
        </PopoverContent>
      </Popover>
    )
  }
)

GroupSelector.displayName = 'GroupSelector'
