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
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import {
  type ParamOverrideCondition,
  CONDITION_MODE_OPTIONS,
} from './param-override-definitions'

// ---------------------------------------------------------------------------
// ConditionEditor
// ---------------------------------------------------------------------------

type ConditionEditorProps = {
  condition: ParamOverrideCondition
  conditionIndex: number
  operationId: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  updateCondition: (
    operationId: string,
    conditionId: string,
    patch: Partial<ParamOverrideCondition>
  ) => void
  removeCondition: (operationId: string, conditionId: string) => void
}

export function ConditionEditor(conditionEditorProps: ConditionEditorProps) {
  const { t } = useTranslation()
  const condition = conditionEditorProps.condition

  return (
    <Collapsible
      open={conditionEditorProps.expanded}
      onOpenChange={conditionEditorProps.onExpandedChange}
    >
      <div className='rounded-md border'>
        <CollapsibleTrigger className='hover:bg-muted/50 flex w-full items-center justify-between px-3 py-2'>
          <div className='flex items-center gap-2'>
            <Badge variant='outline' className='text-[10px]'>
              C{conditionEditorProps.conditionIndex + 1}
            </Badge>
            <span className='text-muted-foreground text-xs'>
              {condition.path || t('Path not set')}
            </span>
          </div>
          {conditionEditorProps.expanded ? (
            <ChevronUp className='text-muted-foreground h-3.5 w-3.5' />
          ) : (
            <ChevronDown className='text-muted-foreground h-3.5 w-3.5' />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className='space-y-3 border-t px-3 py-3'>
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground text-xs'>
                {t('Condition Settings')}
              </span>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                className='text-destructive hover:text-destructive h-7 text-xs'
                onClick={() =>
                  conditionEditorProps.removeCondition(
                    conditionEditorProps.operationId,
                    condition.id
                  )
                }
              >
                <Trash2 className='mr-1 h-3 w-3' />
                {t('Delete Condition')}
              </Button>
            </div>
            <div className='grid gap-2 sm:grid-cols-3'>
              <div className='space-y-1'>
                <label className='text-[10px] font-medium'>
                  {t('Field Path')}
                </label>
                <Input
                  value={condition.path}
                  onChange={(e) =>
                    conditionEditorProps.updateCondition(
                      conditionEditorProps.operationId,
                      condition.id,
                      { path: e.target.value }
                    )
                  }
                  placeholder='model'
                  className='h-8 text-xs'
                />
              </div>
              <div className='space-y-1'>
                <label className='text-[10px] font-medium'>
                  {t('Match Mode')}
                </label>
                <Select
                  items={CONDITION_MODE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: t(o.label),
                  }))}
                  value={condition.mode}
                  onValueChange={(v) =>
                    v !== null &&
                    conditionEditorProps.updateCondition(
                      conditionEditorProps.operationId,
                      condition.id,
                      { mode: v }
                    )
                  }
                >
                  <SelectTrigger className='h-8 text-xs'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {CONDITION_MODE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {t(o.label)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <label className='text-[10px] font-medium'>
                  {t('Match Value')}
                </label>
                <Input
                  value={condition.value_text}
                  onChange={(e) =>
                    conditionEditorProps.updateCondition(
                      conditionEditorProps.operationId,
                      condition.id,
                      { value_text: e.target.value }
                    )
                  }
                  placeholder='gpt'
                  className='h-8 text-xs'
                />
              </div>
            </div>
            <div className='flex flex-wrap gap-4'>
              <label className='flex items-center gap-2 text-xs'>
                <Switch
                  checked={condition.invert}
                  onCheckedChange={(checked) =>
                    conditionEditorProps.updateCondition(
                      conditionEditorProps.operationId,
                      condition.id,
                      { invert: checked }
                    )
                  }
                />
                {t('Invert match')}
              </label>
              <label className='flex items-center gap-2 text-xs'>
                <Switch
                  checked={condition.pass_missing_key}
                  onCheckedChange={(checked) =>
                    conditionEditorProps.updateCondition(
                      conditionEditorProps.operationId,
                      condition.id,
                      { pass_missing_key: checked }
                    )
                  }
                />
                {t('Pass when key is missing')}
              </label>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
