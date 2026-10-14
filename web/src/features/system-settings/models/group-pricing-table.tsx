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
import { Info, Plus, Trash2 } from 'lucide-react'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

import {
  sectionCardClassName,
  sectionHeaderClassName,
} from './group-pricing-controls'
import {
  buildGroupPricingRows,
  type GroupPricingRow,
  sourceGroupPricingSignature,
  groupPricingSignature,
  serializeGroupPricingRows,
  createGroupPricingId,
} from './group-pricing-data'

type GroupPricingTableProps = {
  groupRatio: string
  userUsableGroups: string
  topupGroupRatio: string
  onChange: (field: string, value: string) => void
  onShowDetail: (name: string) => void
}

export function GroupPricingTable({
  groupRatio,
  userUsableGroups,
  topupGroupRatio,
  onChange,
  onShowDetail,
}: GroupPricingTableProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<GroupPricingRow[]>(() =>
    buildGroupPricingRows(groupRatio, userUsableGroups, topupGroupRatio)
  )

  useEffect(() => {
    const incomingSignature = sourceGroupPricingSignature(
      groupRatio,
      userUsableGroups,
      topupGroupRatio
    )
    setRows((currentRows) => {
      if (groupPricingSignature(currentRows) === incomingSignature) {
        return currentRows
      }
      return buildGroupPricingRows(
        groupRatio,
        userUsableGroups,
        topupGroupRatio
      )
    })
  }, [groupRatio, userUsableGroups, topupGroupRatio])

  const emitRows = useCallback(
    (nextRows: GroupPricingRow[]) => {
      setRows(nextRows)
      const serialized = serializeGroupPricingRows(nextRows)
      onChange('GroupRatio', serialized.GroupRatio)
      onChange('UserUsableGroups', serialized.UserUsableGroups)
      onChange('TopupGroupRatio', serialized.TopupGroupRatio)
    },
    [onChange]
  )

  const updateRow = useCallback(
    (
      id: string,
      field: Exclude<keyof GroupPricingRow, '_id'>,
      value: string | number | boolean
    ) => {
      emitRows(
        rows.map((row) => (row._id === id ? { ...row, [field]: value } : row))
      )
    },
    [emitRows, rows]
  )

  const addRow = useCallback(() => {
    const existingNames = new Set(rows.map((row) => row.name))
    let index = 1
    let name = `group_${index}`
    while (existingNames.has(name)) {
      index += 1
      name = `group_${index}`
    }
    emitRows([
      ...rows,
      {
        _id: createGroupPricingId(),
        name,
        ratio: '1',
        topupRatio: '',
        selectable: true,
        description: '',
      },
    ])
  }, [emitRows, rows])

  const removeRow = useCallback(
    (id: string) => {
      emitRows(rows.filter((row) => row._id !== id))
    },
    [emitRows, rows]
  )

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const name = row.name.trim()
      if (!name) continue
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name)
  }, [rows])

  return (
    <Card className={sectionCardClassName}>
      <CardHeader className={sectionHeaderClassName}>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle>{t('Pricing groups')}</CardTitle>
            <CardDescription>
              {t(
                'All group names live here. Ratio applies when calls are billed as this group; top-up ratio applies to users whose account is in this group.'
              )}
            </CardDescription>
          </div>
          <Button onClick={addRow} size='sm' className='sm:self-start'>
            <Plus className='mr-2 h-4 w-4' />
            {t('Add group')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          <StaticDataTable
            data={rows}
            getRowKey={(row) => row._id}
            emptyClassName='text-muted-foreground h-20 text-sm'
            emptyContent={t('No groups yet. Add a group to get started.')}
            columns={[
              {
                id: 'group',
                header: t('Group name'),
                className: 'min-w-40',
                cell: (row) => (
                  <Input
                    value={row.name}
                    onChange={(event) =>
                      updateRow(row._id, 'name', event.target.value)
                    }
                    aria-invalid={duplicateNames.includes(row.name.trim())}
                  />
                ),
              },
              {
                id: 'ratio',
                header: t('Ratio'),
                className: 'w-28',
                cell: (row) => (
                  <Input
                    type='number'
                    min={0}
                    step={0.1}
                    value={row.ratio}
                    onChange={(event) =>
                      updateRow(row._id, 'ratio', event.target.value)
                    }
                  />
                ),
              },
              {
                id: 'topup-ratio',
                header: t('Top-up ratio'),
                className: 'w-28',
                cell: (row) => (
                  <Input
                    type='number'
                    min={0}
                    step={0.1}
                    value={row.topupRatio}
                    placeholder={t('Not set')}
                    onChange={(event) =>
                      updateRow(row._id, 'topupRatio', event.target.value)
                    }
                  />
                ),
              },
              {
                id: 'selectable',
                header: t('User selectable'),
                className: 'w-28 text-center',
                cell: (row) => (
                  <div className='flex justify-center'>
                    <Checkbox
                      checked={row.selectable}
                      onCheckedChange={(checked) =>
                        updateRow(row._id, 'selectable', checked === true)
                      }
                      aria-label={t('User selectable')}
                    />
                  </div>
                ),
              },
              {
                id: 'description',
                header: t('Description'),
                className: 'min-w-56',
                cell: (row) =>
                  row.selectable ? (
                    <Input
                      value={row.description}
                      placeholder={t('Group description')}
                      onChange={(event) =>
                        updateRow(row._id, 'description', event.target.value)
                      }
                    />
                  ) : (
                    <span className='text-muted-foreground px-3 text-sm'>
                      -
                    </span>
                  ),
              },
              {
                id: 'actions',
                header: t('Actions'),
                className: 'text-right',
                cellClassName: 'text-right',
                cell: (row) => (
                  <div className='flex justify-end gap-1'>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => onShowDetail(row.name.trim())}
                      disabled={!row.name.trim()}
                      aria-label={t('Details')}
                    >
                      <Info className='h-4 w-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => removeRow(row._id)}
                      aria-label={t('Delete')}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                ),
              },
            ]}
          />

          {duplicateNames.length > 0 && (
            <p className='text-destructive text-sm'>
              {t('Duplicate group names: {{names}}', {
                names: duplicateNames.join(', '),
              })}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
