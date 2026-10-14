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
/* eslint-disable react-refresh/only-export-components */
'use client'

import type { ComponentProps, HTMLAttributes } from 'react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type PromptInputModelSelectProps = ComponentProps<typeof Select>

export const PromptInputModelSelect = (props: PromptInputModelSelectProps) => (
  <Select {...props} />
)

export type PromptInputModelSelectTriggerProps = ComponentProps<
  typeof SelectTrigger
>

export const PromptInputModelSelectTrigger = ({
  className,
  size = 'sm',
  ...props
}: PromptInputModelSelectTriggerProps) => (
  <SelectTrigger
    className={cn(
      'text-muted-foreground border-none bg-transparent font-medium shadow-none transition-colors',
      'hover:bg-accent hover:text-foreground [&[aria-expanded="true"]]:bg-accent [&[aria-expanded="true"]]:text-foreground',
      className
    )}
    size={size}
    {...props}
  />
)

export type PromptInputModelSelectContentProps = ComponentProps<
  typeof SelectContent
>

export const PromptInputModelSelectContent = ({
  className,
  ...props
}: PromptInputModelSelectContentProps) => (
  <SelectContent className={cn(className)} {...props} />
)

export type PromptInputModelSelectItemProps = ComponentProps<typeof SelectItem>

export const PromptInputModelSelectItem = ({
  className,
  ...props
}: PromptInputModelSelectItemProps) => (
  <SelectItem className={cn(className)} {...props} />
)

export type PromptInputModelSelectValueProps = ComponentProps<
  typeof SelectValue
>

export const PromptInputModelSelectValue = ({
  className,
  ...props
}: PromptInputModelSelectValueProps) => (
  <SelectValue className={cn(className)} {...props} />
)

export type PromptInputHoverCardProps = ComponentProps<typeof HoverCard>

export const PromptInputHoverCard = (props: PromptInputHoverCardProps) => (
  <HoverCard {...props} />
)

export type PromptInputHoverCardTriggerProps = ComponentProps<
  typeof HoverCardTrigger
>

export const PromptInputHoverCardTrigger = ({
  delay = 0,
  closeDelay = 0,
  ...props
}: PromptInputHoverCardTriggerProps) => (
  <HoverCardTrigger delay={delay} closeDelay={closeDelay} {...props} />
)

export type PromptInputHoverCardContentProps = ComponentProps<
  typeof HoverCardContent
>

export const PromptInputHoverCardContent = ({
  align = 'start',
  ...props
}: PromptInputHoverCardContentProps) => (
  <HoverCardContent align={align} {...props} />
)

export type PromptInputTabsListProps = HTMLAttributes<HTMLDivElement>

export const PromptInputTabsList = ({
  className,
  ...props
}: PromptInputTabsListProps) => <div className={cn(className)} {...props} />

export type PromptInputTabProps = HTMLAttributes<HTMLDivElement>

export const PromptInputTab = ({
  className,
  ...props
}: PromptInputTabProps) => <div className={cn(className)} {...props} />

export type PromptInputTabLabelProps = HTMLAttributes<HTMLHeadingElement>

export const PromptInputTabLabel = ({
  className,
  ...props
}: PromptInputTabLabelProps) => (
  <h3
    className={cn(
      'text-muted-foreground mb-2 px-3 text-xs font-medium',
      className
    )}
    {...props}
  />
)

export type PromptInputTabBodyProps = HTMLAttributes<HTMLDivElement>

export const PromptInputTabBody = ({
  className,
  ...props
}: PromptInputTabBodyProps) => (
  <div className={cn('space-y-1', className)} {...props} />
)

export type PromptInputTabItemProps = HTMLAttributes<HTMLDivElement>

export const PromptInputTabItem = ({
  className,
  ...props
}: PromptInputTabItemProps) => (
  <div
    className={cn(
      'hover:bg-accent flex items-center gap-2 px-3 py-2 text-xs',
      className
    )}
    {...props}
  />
)

export type PromptInputCommandProps = ComponentProps<typeof Command>

export const PromptInputCommand = ({
  className,
  ...props
}: PromptInputCommandProps) => <Command className={cn(className)} {...props} />

export type PromptInputCommandInputProps = ComponentProps<typeof CommandInput>

export const PromptInputCommandInput = ({
  className,
  ...props
}: PromptInputCommandInputProps) => (
  <CommandInput className={cn(className)} {...props} />
)

export type PromptInputCommandListProps = ComponentProps<typeof CommandList>

export const PromptInputCommandList = ({
  className,
  ...props
}: PromptInputCommandListProps) => (
  <CommandList className={cn(className)} {...props} />
)

export type PromptInputCommandEmptyProps = ComponentProps<typeof CommandEmpty>

export const PromptInputCommandEmpty = ({
  className,
  ...props
}: PromptInputCommandEmptyProps) => (
  <CommandEmpty className={cn(className)} {...props} />
)

export type PromptInputCommandGroupProps = ComponentProps<typeof CommandGroup>

export const PromptInputCommandGroup = ({
  className,
  ...props
}: PromptInputCommandGroupProps) => (
  <CommandGroup className={cn(className)} {...props} />
)

export type PromptInputCommandItemProps = ComponentProps<typeof CommandItem>

export const PromptInputCommandItem = ({
  className,
  ...props
}: PromptInputCommandItemProps) => (
  <CommandItem className={cn(className)} {...props} />
)

export type PromptInputCommandSeparatorProps = ComponentProps<
  typeof CommandSeparator
>

export const PromptInputCommandSeparator = ({
  className,
  ...props
}: PromptInputCommandSeparatorProps) => (
  <CommandSeparator className={cn(className)} {...props} />
)
