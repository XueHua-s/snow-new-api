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
import { VChart } from '@visactor/react-vchart'
import type { IVChart } from '@visactor/vchart'
import {
  ChevronRight,
  CircleAlert,
  EyeOff,
  GitBranch,
  Info,
  Loader2,
  Route,
} from 'lucide-react'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

import { MultiSelect } from '@/components/multi-select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { compactFlowSelectionLabel } from '@/features/dashboard/lib/flow-selection'
import type { FlowMetric, FlowOverflowMode } from '@/features/dashboard/types'
import { cn } from '@/lib/utils'
import { VCHART_OPTION } from '@/lib/vchart'

import {
  FLOW_METRIC_OPTIONS,
  FLOW_TOP_LIMIT_OPTIONS,
  FLOW_OVERFLOW_MODE_OPTIONS,
  FLOW_STAGE_LABEL_KEYS,
  FLOW_STAGE_META,
} from './flow-chart-options'
import { FlowNodeFilterControl } from './flow-node-filter'
import { type FlowChartsProps, useFlowCharts } from './use-flow-charts'

export function FlowCharts(props: FlowChartsProps) {
  const { t } = useTranslation()
  const {
    chartInstanceRef,
    isAdmin,
    metric,
    setMetric,
    topNodeLimit,
    setTopNodeLimit,
    overflowMode,
    setOverflowMode,
    selectedUsers,
    setSelectedUsers,
    selectedNodes,
    hiddenStages,
    stages,
    toggleStage,
    isLoading,
    userFilterOptions,
    nodeFilterStages,
    nodeFilterOptions,
    metricLabel,
    formatNodeMetricValue,
    toggleFlowNodeFilter,
    removeFlowNodeFilter,
    clearFlowNodeFilters,
    handleChartPointerDown,
    chartTitle,
    flowSpec,
    chartTheme,
    chartKey,
    displayState,
    flowErrorMessage,
  } = useFlowCharts(props)
  let chartContent = (
    <VChart
      key={`flow-${chartKey}`}
      spec={{
        ...flowSpec,
        theme: chartTheme,
        background: 'transparent',
      }}
      option={VCHART_OPTION}
      onReady={(instance: IVChart) => {
        chartInstanceRef.current = instance
      }}
      onPointerDown={handleChartPointerDown}
    />
  )
  if (displayState === 'loading') {
    chartContent = <Skeleton className='h-full w-full' />
  } else if (displayState === 'error') {
    chartContent = (
      <div className='flex h-full items-center justify-center p-4'>
        <Alert variant='destructive' className='max-w-md'>
          <CircleAlert />
          <AlertTitle>{t('Failed to load')}</AlertTitle>
          <AlertDescription>{flowErrorMessage}</AlertDescription>
        </Alert>
      </div>
    )
  } else if (displayState === 'empty') {
    chartContent = (
      <Empty className='h-full border-0 py-12'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Route />
          </EmptyMedia>
          <EmptyTitle>{t('No flow data available')}</EmptyTitle>
          <EmptyDescription>{t('No data available')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between'>
        <div className='flex min-w-0 flex-wrap items-end gap-2'>
          <div className='flex min-w-0 flex-col gap-1.5'>
            <div className='flex items-center gap-1.5'>
              <span className='text-muted-foreground text-xs font-medium'>
                {t('Flow width metric')}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type='button'
                        className='text-muted-foreground/60 hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded-md'
                        aria-label={t('Flow width metric')}
                      />
                    }
                  >
                    <Info className='size-3.5' />
                  </TooltipTrigger>
                  <TooltipContent className='max-w-[14rem]'>
                    {t('Choose how flow widths are calculated.')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Tabs
              value={metric}
              onValueChange={(value) => setMetric(value as FlowMetric)}
              className='shrink-0'
            >
              <TabsList aria-label={t('Flow width metric')}>
                {FLOW_METRIC_OPTIONS.map((option) => {
                  const Icon = option.icon
                  return (
                    <TabsTrigger
                      key={option.value}
                      value={option.value}
                      className='gap-1.5 px-2.5 text-xs'
                    >
                      <Icon data-icon='inline-start' aria-hidden='true' />
                      {t(option.labelKey)}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </Tabs>
          </div>

          <div className='flex min-w-0 flex-col gap-1.5'>
            <span className='text-muted-foreground text-xs font-medium'>
              {t('Display limit')}
            </span>
            <Tabs
              value={String(topNodeLimit)}
              onValueChange={(value) => setTopNodeLimit(Number(value))}
              className='shrink-0'
            >
              <TabsList aria-label={t('Display limit')}>
                {FLOW_TOP_LIMIT_OPTIONS.map((limit) => (
                  <TabsTrigger
                    key={limit}
                    value={String(limit)}
                    className='px-2.5 text-xs'
                  >
                    {t('Top {{count}}', { count: limit })}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className='flex min-w-0 flex-col gap-1.5'>
            <span className='text-muted-foreground text-xs font-medium'>
              {t('Overflow items')}
            </span>
            <Tabs
              value={overflowMode}
              onValueChange={(value) =>
                setOverflowMode(value as FlowOverflowMode)
              }
              className='shrink-0'
            >
              <TabsList aria-label={t('Overflow items')}>
                {FLOW_OVERFLOW_MODE_OPTIONS.map((option) => (
                  <TabsTrigger
                    key={option.value}
                    value={option.value}
                    className='px-2.5 text-xs'
                  >
                    {t(option.labelKey)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <FlowNodeFilterControl
            stages={nodeFilterStages}
            stageLabels={FLOW_STAGE_LABEL_KEYS}
            metricLabel={metricLabel}
            formatMetricValue={formatNodeMetricValue}
            options={nodeFilterOptions}
            selectedNodes={selectedNodes}
            onToggleNode={toggleFlowNodeFilter}
            onRemoveNode={removeFlowNodeFilter}
            onClearNodes={clearFlowNodeFilters}
          />
        </div>

        <div className='flex min-w-0 items-center gap-2 xl:justify-end'>
          {isAdmin && (
            <div className='flex min-w-0 flex-col gap-2 sm:flex-row xl:w-[min(24rem,34vw)]'>
              <MultiSelect
                options={userFilterOptions}
                selected={selectedUsers}
                onChange={setSelectedUsers}
                placeholder={t('All users')}
                emptyText={t('No users')}
                maxVisibleChips={2}
                renderSelectedSummary={(values) =>
                  compactFlowSelectionLabel(values.length)
                }
              />
            </div>
          )}
          {isLoading && (
            <Loader2 className='text-muted-foreground size-4 animate-spin' />
          )}
        </div>
      </div>

      <div className='overflow-hidden rounded-lg border'>
        <div className='flex w-full flex-col gap-2 border-b px-3 py-2 sm:px-5 sm:py-3 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex min-w-0 items-center gap-2'>
            <IconBadge tone='info' size='sm'>
              <GitBranch />
            </IconBadge>
            <div className='text-sm font-semibold'>{chartTitle}</div>
          </div>
          <TooltipProvider>
            <div className='flex min-w-0 items-center gap-1 overflow-x-auto pb-1 lg:justify-end lg:pb-0'>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type='button'
                      className='text-muted-foreground/60 hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md'
                      aria-label={t('Show or hide flow columns')}
                    />
                  }
                >
                  <Info className='size-3.5' />
                </TooltipTrigger>
                <TooltipContent className='max-w-[16rem]'>
                  {t('Click a stage to show or hide that column')}
                </TooltipContent>
              </Tooltip>
              {stages.map((stage, index) => {
                const meta = FLOW_STAGE_META[stage]
                const visible = !hiddenStages.includes(stage)
                return (
                  <Fragment key={stage}>
                    {index > 0 && (
                      <ChevronRight className='text-muted-foreground/40 size-3.5 shrink-0' />
                    )}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Toggle
                            variant='outline'
                            size='sm'
                            pressed={visible}
                            onPressedChange={() => toggleStage(stage)}
                            aria-label={t(meta.labelKey)}
                            className={cn('shrink-0', !visible && 'opacity-50')}
                          />
                        }
                      >
                        {!visible && <EyeOff className='size-3' />}
                        {t(meta.labelKey)}
                      </TooltipTrigger>
                      <TooltipContent>{t(meta.descKey)}</TooltipContent>
                    </Tooltip>
                  </Fragment>
                )
              })}
            </div>
          </TooltipProvider>
        </div>
        <div className='h-[560px] p-1.5 sm:h-[680px] sm:p-2 2xl:h-[760px]'>
          {chartContent}
        </div>
      </div>
    </div>
  )
}
