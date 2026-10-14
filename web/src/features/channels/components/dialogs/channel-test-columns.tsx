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
import type { ColumnDef } from '@tanstack/react-table'
import { Gauge, Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import type {
  TestResult,
  FailureDetailsState,
  ModelRow,
} from './channel-test-data'
import { TestStatusCell, TestResultCell } from './channel-test-results'

export function useChannelTestColumns({
  defaultTestModel,
  testResults,
  setFailureDetails,
  testingModels,
  testSingleModel,
  isBatchTesting,
}: {
  defaultTestModel: string | undefined
  testResults: Record<string, TestResult>
  setFailureDetails: React.Dispatch<
    React.SetStateAction<FailureDetailsState | null>
  >
  testingModels: Set<string>
  testSingleModel: (
    model: string,
    silent?: boolean,
    refreshList?: boolean
  ) => Promise<TestResult | undefined>
  isBatchTesting: boolean
}) {
  const { t } = useTranslation()
  const columns = useMemo<ColumnDef<ModelRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={
              table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
            }
            onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
            aria-label={t('Select all models')}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={t('Select model {{model}}', {
              model: row.original.model,
            })}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: 'model',
        header: t('Model'),
        cell: ({ row }) => {
          const model = row.original.model
          const isDefault = defaultTestModel === model

          return (
            <div className='flex w-max items-center gap-2 whitespace-nowrap'>
              <span className='font-medium whitespace-nowrap' title={model}>
                {model}
              </span>
              {isDefault && (
                <StatusBadge
                  label={t('Default')}
                  variant='info'
                  size='sm'
                  copyable={false}
                />
              )}
            </div>
          )
        },
      },
      {
        id: 'status',
        header: t('Status'),
        cell: ({ row }) => {
          const model = row.original.model
          const result = testResults[model]
          return <TestStatusCell result={result} />
        },
        enableSorting: false,
        size: 112,
      },
      {
        id: 'result',
        header: t('Result'),
        cell: ({ row }) => {
          const model = row.original.model
          const result = testResults[model]
          return (
            <TestResultCell
              result={result}
              model={model}
              onOpenDetails={setFailureDetails}
            />
          )
        },
        enableSorting: false,
        size: 320,
      },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) => {
          const model = row.original.model
          const isTestingModel = testingModels.has(model)

          return (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    onClick={() => testSingleModel(model)}
                    disabled={isTestingModel || isBatchTesting}
                    aria-label={t('Test Connection')}
                  />
                }
              >
                {isTestingModel ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <Gauge className='size-4' />
                )}
              </TooltipTrigger>
              <TooltipContent>{t('Test Connection')}</TooltipContent>
            </Tooltip>
          )
        },
        enableSorting: false,
      },
    ],
    [
      defaultTestModel,
      isBatchTesting,
      t,
      testResults,
      testingModels,
      testSingleModel,
      setFailureDetails,
    ]
  )
  return { columns }
}
