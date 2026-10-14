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
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  buildAdvancedCustomAuth,
  createAdvancedCustomManagementRoute,
  getAdvancedCustomAuthMode,
} from '../../lib/advanced-custom'
import {
  ADVANCED_CUSTOM_AUTH_MODE_OPTIONS,
  ADVANCED_CUSTOM_MODEL_LIST_PATH,
  type AdvancedCustomAuthMode,
} from '../../lib/advanced-custom-options'
import type { AdvancedCustomRoute } from '../../types'
import {
  FieldBlock,
  upstreamPathDescriptionKey,
} from './advanced-custom-editor-shared'
import { getOptionLabel } from './advanced-route-groups'

export function ManagementRouteEditor({
  route,
  path,
  title,
  description,
  onChange,
}: {
  route: AdvancedCustomRoute | undefined
  path: string
  title: string
  description: string
  onChange: (route: AdvancedCustomRoute | null) => void
}) {
  const { t } = useTranslation()
  const authMode = route ? getAdvancedCustomAuthMode(route) : 'default'

  if (!route) {
    return (
      <div className='flex min-h-52 flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-6 text-center'>
        <div>
          <p className='font-medium'>{title}</p>
          <p className='text-muted-foreground mt-1 max-w-lg text-sm'>
            {description}
          </p>
          <p className='text-muted-foreground mt-2 font-mono text-xs'>{path}</p>
        </div>
        <Button
          type='button'
          onClick={() => onChange(createAdvancedCustomManagementRoute(path))}
        >
          <Plus data-icon='inline-start' />
          {t('Add management route')}
        </Button>
      </div>
    )
  }

  const updateAuth = (
    field: Exclude<keyof NonNullable<AdvancedCustomRoute['auth']>, 'type'>,
    value: string
  ) => {
    if (!route.auth || route.auth.type === 'none') return
    onChange({
      ...route,
      auth: {
        type: route.auth.type,
        name: route.auth.name || '',
        value: route.auth.value || '',
        [field]: value,
      },
    })
  }

  return (
    <div className='flex flex-col gap-4 rounded-lg border p-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <p className='font-medium'>{title}</p>
          <p className='text-muted-foreground mt-1 text-sm'>{description}</p>
          <p className='text-muted-foreground mt-1 font-mono text-xs'>{path}</p>
        </div>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={() => onChange(null)}
        >
          <Trash2 data-icon='inline-start' />
          {t('Delete')}
        </Button>
      </div>
      <div className='grid gap-4 md:grid-cols-2'>
        <FieldBlock label={t('Upstream path')}>
          <Input
            value={route.upstream_path || ''}
            onChange={(event) =>
              onChange({ ...route, upstream_path: event.target.value })
            }
            placeholder={
              path === ADVANCED_CUSTOM_MODEL_LIST_PATH
                ? '/v1/models'
                : '/dashboard/billing/credit_grants'
            }
          />
        </FieldBlock>
        <FieldBlock label={t('Auth')}>
          <Select
            value={authMode}
            onValueChange={(value) =>
              onChange({
                ...route,
                auth: buildAdvancedCustomAuth(
                  value as AdvancedCustomAuthMode,
                  route.auth
                ),
              })
            }
          >
            <SelectTrigger>
              <SelectValue className='min-w-0 truncate'>
                {t(getOptionLabel(ADVANCED_CUSTOM_AUTH_MODE_OPTIONS, authMode))}
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
        {authMode === 'header' || authMode === 'query' ? (
          <>
            <FieldBlock label={t('Auth name')}>
              <Input
                value={route.auth?.name || ''}
                onChange={(event) => updateAuth('name', event.target.value)}
                placeholder={
                  authMode === 'header' ? 'Authorization' : 'api_key'
                }
              />
            </FieldBlock>
            <FieldBlock label={t('Auth value')}>
              <Input
                value={route.auth?.value || ''}
                onChange={(event) => updateAuth('value', event.target.value)}
                placeholder={
                  authMode === 'header' ? 'Bearer {api_key}' : '{api_key}'
                }
              />
            </FieldBlock>
          </>
        ) : null}
      </div>
      <p className='text-muted-foreground text-xs'>
        {t(upstreamPathDescriptionKey)}
      </p>
    </div>
  )
}
