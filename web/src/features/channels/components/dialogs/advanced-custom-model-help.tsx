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
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

export function ModelRuleHelpPopover() {
  const { t } = useTranslation()

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='text-muted-foreground hover:text-foreground size-6'
            aria-label={t('Client model matching help')}
          />
        }
      >
        <Info className='size-3.5' aria-hidden='true' />
      </PopoverTrigger>
      <PopoverContent
        align='start'
        side='bottom'
        sideOffset={8}
        className='w-[min(22rem,calc(100vw-2rem))] gap-3 p-3'
      >
        <PopoverHeader className='gap-1'>
          <PopoverTitle>{t('Client model matching')}</PopoverTitle>
          <PopoverDescription className='text-xs leading-relaxed'>
            {t(
              'Rules match the original model value from the client request body.'
            )}
          </PopoverDescription>
        </PopoverHeader>
        <div className='text-muted-foreground space-y-2 text-xs leading-relaxed'>
          <p>
            {t(
              'Use exact model names such as gpt-4o, or regex rules prefixed with re: such as re:^gemini-.'
            )}
          </p>
          <p>
            {t(
              'Separate multiple rules with English commas. For regex patterns that need commas, switch to JSON Text.'
            )}
          </p>
          <p>
            {t(
              'Leave the final split empty as the fallback for models not matched above.'
            )}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
