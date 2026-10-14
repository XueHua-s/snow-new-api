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
import { ClipboardPaste } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { sideDrawerHeaderClassName } from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { ChannelTypeLogo } from './channel-editor-controls'
import type { useChannelEditor } from './use-channel-editor'

export function ChannelEditorHeader({
  currentType,
  isEditing,
  currentTypeLabel,
  pasteConnectionInfoFromClipboard,
}: {
  currentType: ReturnType<typeof useChannelEditor>['currentType']
  isEditing: ReturnType<typeof useChannelEditor>['isEditing']
  currentTypeLabel: ReturnType<typeof useChannelEditor>['currentTypeLabel']
  pasteConnectionInfoFromClipboard: ReturnType<
    typeof useChannelEditor
  >['pasteConnectionInfoFromClipboard']
}) {
  const { t } = useTranslation()
  return (
    <SheetHeader className={sideDrawerHeaderClassName()}>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <SheetTitle className='flex items-center gap-3'>
            <IconBadge tone='info' size='title'>
              <ChannelTypeLogo type={currentType} size={22} />
            </IconBadge>
            <span>
              {isEditing ? t('Edit Channel') : t('Create Channel')}
              <span className='text-muted-foreground ml-2 text-sm font-normal'>
                {t(currentTypeLabel)}
              </span>
            </span>
          </SheetTitle>
          <SheetDescription className='mt-1'>
            {isEditing
              ? t(
                  "Update channel configuration and click save when you're done."
                )
              : t('Add a new channel by providing the necessary information.')}
          </SheetDescription>
        </div>
        {!isEditing && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='shrink-0'
            onClick={pasteConnectionInfoFromClipboard}
          >
            <ClipboardPaste className='size-4' />
            <span>{t('Paste Connection Info')}</span>
          </Button>
        )}
      </div>
    </SheetHeader>
  )
}
