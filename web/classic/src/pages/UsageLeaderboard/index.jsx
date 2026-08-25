/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import React, { useState } from 'react';
import { GapRoadmap } from './components/GapRoadmap';
import { LeaderboardControls } from './components/LeaderboardControls';
import { LeaderboardHero } from './components/LeaderboardHero';
import {
  LeaderboardEmpty,
  LeaderboardError,
  LeaderboardLoading,
} from './components/LeaderboardStates';
import { MomentumSection } from './components/MomentumSection';
import { TopTenChart } from './components/TopTenChart';
import { TrendChart } from './components/TrendChart';
import { useLeaderboardMetric } from './hooks/useLeaderboardMetric';
import { useUsageLeaderboard } from './hooks/useUsageLeaderboard';
import './usage-leaderboard.css';

export default function UsageLeaderboard() {
  const [period, setPeriod] = useState('day');
  const [metric, setMetric] = useLeaderboardMetric();
  const { snapshot, loading, error, reload } = useUsageLeaderboard(period);
  let board = null;
  if (snapshot) {
    board = metric === 'tokens' ? snapshot.token_board : snapshot.quota_board;
  }

  let content;
  if (loading) {
    content = <LeaderboardLoading />;
  } else if (error && !board) {
    content = (
      <LeaderboardError message={error} onRetry={() => void reload()} />
    );
  } else if (!board || board.top.length === 0) {
    content = <LeaderboardEmpty />;
  } else {
    content = (
      <>
        <MomentumSection board={board} metric={metric} period={period} />
        <div className='lb-main-grid grid min-w-0 grid-cols-1 gap-4'>
          <div className='lb-main-chart min-w-0'>
            <TopTenChart board={board} metric={metric} period={period} />
          </div>
          <div className='lb-main-roadmap min-w-0'>
            <GapRoadmap board={board} metric={metric} />
          </div>
        </div>
        <div className='pt-1'>
          <TrendChart board={board} metric={metric} period={period} />
        </div>
      </>
    );
  }

  return (
    <main className='usage-leaderboard-page mt-[60px] w-full min-w-0 px-2 pb-8'>
      <div className='lb-shell w-full min-w-0 space-y-6'>
        <LeaderboardHero
          board={board}
          period={period}
          metric={metric}
          loading={loading}
        />
        <LeaderboardControls
          period={period}
          metric={metric}
          onPeriodChange={setPeriod}
          onMetricChange={setMetric}
        />

        {content}
      </div>
    </main>
  );
}
