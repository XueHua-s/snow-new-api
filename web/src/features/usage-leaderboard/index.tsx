/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useNavigate, useSearch } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useCallback, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '../../components/layout/components/section-page-layout'
import { GapRoadmap } from './components/gap-roadmap'
import { LeaderboardControls } from './components/leaderboard-controls'
import { LeaderboardHero } from './components/leaderboard-hero'
import {
  LeaderboardEmpty,
  LeaderboardError,
  LeaderboardLoading,
} from './components/leaderboard-states'
import { PersonalMomentum } from './components/momentum-section'
import { TopTenChart } from './components/top-ten-chart'
import { TrendChart } from './components/trend-chart'
import { USAGE_LEADERBOARD_PERIOD_SET } from './constants'
import { useLeaderboardMetric } from './hooks/use-leaderboard-metric'
import { useUsageLeaderboard } from './hooks/use-usage-leaderboard'
import type {
  UsageLeaderboardMetric,
  UsageLeaderboardPeriod,
  UsageLeaderboardSnapshot,
} from './types'

import './usage-leaderboard.css'

function normalizePeriod(period: string | undefined): UsageLeaderboardPeriod {
  return USAGE_LEADERBOARD_PERIOD_SET.has(period as UsageLeaderboardPeriod)
    ? (period as UsageLeaderboardPeriod)
    : 'day'
}

function selectBoard(
  snapshot: UsageLeaderboardSnapshot | undefined,
  metric: UsageLeaderboardMetric
) {
  if (!snapshot) return null
  return metric === 'tokens' ? snapshot.token_board : snapshot.quota_board
}

export function UsageLeaderboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const search = useSearch({ from: '/_authenticated/usage-leaderboard/' })
  const period = normalizePeriod(search.period)
  const [metric, setMetric] = useLeaderboardMetric()
  const query = useUsageLeaderboard(period)
  const board = selectBoard(query.data, metric)

  const setPeriod = useCallback(
    (next: UsageLeaderboardPeriod) => {
      void navigate({
        to: '/usage-leaderboard',
        search: { period: next },
      })
    },
    [navigate]
  )

  let content: ReactNode
  if (query.isLoading) {
    content = <LeaderboardLoading />
  } else if (query.isError || !board) {
    const message =
      query.error instanceof Error
        ? query.error.message
        : t('The leaderboard could not be loaded. Try again soon.')
    content = (
      <LeaderboardError
        message={message}
        onRetry={() => void query.refetch()}
      />
    )
  } else if (board.top.length === 0) {
    content = <LeaderboardEmpty />
  } else {
    content = (
      <>
        <PersonalMomentum board={board} metric={metric} period={period} />
        <div className='lb-default-main-grid grid min-w-0 gap-4'>
          <div className='lb-default-main-chart min-w-0'>
            <TopTenChart board={board} metric={metric} period={period} />
          </div>
          <div className='lb-default-main-roadmap min-w-0'>
            <GapRoadmap board={board} metric={metric} />
          </div>
        </div>
        <div className='pt-1'>
          <TrendChart board={board} metric={metric} period={period} />
        </div>
      </>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Grind Leaderboard')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex'>
          <RefreshCw className='size-3.5' aria-hidden />
          {t('Leaderboard updates about every minute')}
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='usage-leaderboard-default lb-default-shell relative w-full min-w-0 space-y-6 overflow-hidden pb-6'>
          <div
            aria-hidden
            className='pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 opacity-40 dark:opacity-20'
            style={{
              background:
                'radial-gradient(circle at 18% 12%, rgb(59 130 246 / 24%), transparent 36%), radial-gradient(circle at 82% 18%, rgb(6 182 212 / 18%), transparent 32%)',
            }}
          />

          <LeaderboardHero
            period={period}
            metric={metric}
            board={board}
            loading={query.isLoading}
          />

          <LeaderboardControls
            period={period}
            metric={metric}
            onPeriodChange={setPeriod}
            onMetricChange={setMetric}
          />

          {content}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
