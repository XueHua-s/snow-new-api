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
import { Plus, Trash2, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { BadgeCell } from '@/components/data-table/core/badge-cell'
import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getBgColorClass } from '@/lib/colors'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { type ApiInfoSectionProps, useApiInfo } from './use-api-info'

const API_INFO_FORM_ID = 'api-info-form'

const colorOptions = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'purple', label: 'Purple' },
  { value: 'pink', label: 'Pink' },
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'amber', label: 'Amber' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'lime', label: 'Lime' },
  { value: 'teal', label: 'Teal' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'violet', label: 'Violet' },
  { value: 'slate', label: 'Slate' },
]

export function ApiInfoSection({ enabled, data }: ApiInfoSectionProps) {
  const { t } = useTranslation()
  const {
    updateOption,
    selectedIds,
    showDialog,
    setShowDialog,
    showDeleteDialog,
    setShowDeleteDialog,
    editingApiInfo,
    deleteTarget,
    apiInfoList,
    isEnabled,
    hasChanges,
    form,
    handleToggleEnabled,
    handleAdd,
    handleEdit,
    handleDelete,
    handleBatchDelete,
    confirmDelete,
    handleSubmitForm,
    handleSaveAll,
    toggleSelectAll,
    toggleSelectOne,
    getColorClass,
  } = useApiInfo({ enabled, data })
  return (
    <SettingsSection title={t('API Addresses')}>
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Button onClick={handleAdd} size='sm'>
              <Plus className='mr-2 h-4 w-4' />
              {t('Add API')}
            </Button>
            <Button
              onClick={handleBatchDelete}
              size='sm'
              variant='destructive'
              disabled={selectedIds.length === 0}
            >
              <Trash2 className='mr-2 h-4 w-4' />
              {t('Delete (')}
              {selectedIds.length})
            </Button>
            <Button
              onClick={handleSaveAll}
              size='sm'
              variant='secondary'
              disabled={!hasChanges || updateOption.isPending}
            >
              <Save className='mr-2 h-4 w-4' />
              {updateOption.isPending ? t('Saving...') : t('Save Settings')}
            </Button>
          </div>
          <SettingsSwitchField
            checked={isEnabled}
            onCheckedChange={handleToggleEnabled}
            label={t('Enabled')}
            className='py-0'
          />
        </div>

        <StaticDataTable
          data={apiInfoList}
          getRowKey={(apiInfo) => apiInfo.id}
          emptyContent={t('No API Domains yet. Click "Add API" to create one.')}
          columns={[
            {
              id: 'select',
              header: (
                <Checkbox
                  checked={
                    selectedIds.length === apiInfoList.length &&
                    apiInfoList.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              ),
              className: 'w-12',
              cell: (apiInfo) => (
                <Checkbox
                  checked={selectedIds.includes(apiInfo.id)}
                  onCheckedChange={(checked) =>
                    toggleSelectOne(apiInfo.id, checked as boolean)
                  }
                />
              ),
            },
            {
              id: 'url',
              header: t('URL'),
              cellClassName: 'max-w-xs truncate font-mono text-sm',
              cell: (apiInfo) => (
                <BadgeCell>
                  <StatusBadge
                    label={apiInfo.url}
                    variant='neutral'
                    copyable={false}
                  />
                </BadgeCell>
              ),
            },
            {
              id: 'route',
              header: t('Route'),
              cell: (apiInfo) => (
                <BadgeCell>
                  <StatusBadge
                    label={apiInfo.route}
                    variant='neutral'
                    copyable={false}
                  />
                </BadgeCell>
              ),
            },
            {
              id: 'description',
              header: t('Description'),
              cellClassName: 'max-w-xs truncate',
              cell: (apiInfo) => apiInfo.description,
            },
            {
              id: 'color',
              header: t('Color'),
              cell: (apiInfo) => (
                <div className='flex items-center gap-2'>
                  <div
                    className={`h-4 w-4 rounded-full ${getColorClass(apiInfo.color)}`}
                  />
                  <span className='text-sm capitalize'>{apiInfo.color}</span>
                </div>
              ),
            },
            {
              id: 'actions',
              header: t('Actions'),
              cell: (apiInfo) => (
                <StaticRowActions
                  editLabel={t('Edit')}
                  deleteLabel={t('Delete')}
                  menuLabel={t('Open menu')}
                  onEdit={() => handleEdit(apiInfo)}
                  onDelete={() => handleDelete(apiInfo)}
                />
              ),
            },
          ]}
        />
      </div>

      <Dialog
        open={showDialog}
        onOpenChange={setShowDialog}
        title={editingApiInfo ? t('Edit API Shortcut') : t('Add API Shortcut')}
        description={t('Configure API documentation links for the dashboard')}
        contentHeight='auto'
        bodyClassName='space-y-4'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={() => setShowDialog(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' form={API_INFO_FORM_ID}>
              {editingApiInfo ? t('Update') : t('Add')}
            </Button>
          </>
        }
      >
        <Form {...form}>
          <form
            id={API_INFO_FORM_ID}
            onSubmit={form.handleSubmit(handleSubmitForm)}
            className='space-y-4'
          >
            <FormField
              control={form.control}
              name='url'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('API URL')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('https://api.example.com')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='route'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Route Description')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('e.g., CN2 GIA')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Description')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t(
                        'e.g., Recommended for China Mainland Users'
                      )}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='color'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Badge Color')}</FormLabel>
                  <Select
                    items={colorOptions.map((option) => ({
                      value: option.value,
                      label: (
                        <div className='flex items-center gap-2'>
                          <div
                            className={`h-4 w-4 rounded-full ${getBgColorClass(option.value)}`}
                          />
                          {option.label}
                        </div>
                      ),
                    }))}
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select a color')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {colorOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className='flex items-center gap-2'>
                              <div
                                className={`h-4 w-4 rounded-full ${getBgColorClass(option.value)}`}
                              />
                              {option.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t('Visual indicator color for the API card')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === 'single'
                ? t('This API shortcut will be removed from the list.')
                : t('{{count}} API shortcuts will be removed from the list.', {
                    count: selectedIds.length,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={confirmDelete}>
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}
