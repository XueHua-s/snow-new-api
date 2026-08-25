import { useCallback, useState } from 'react';

const STORAGE_KEY = 'usage-leaderboard:metric:v1';

function readStoredMetric() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'quota' ? 'quota' : 'tokens';
  } catch {
    return 'tokens';
  }
}

export function useLeaderboardMetric() {
  const [metric, setMetric] = useState(readStoredMetric);

  const updateMetric = useCallback((next) => {
    setMetric(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The preference is optional; private browsing can disable storage.
    }
  }, []);

  return [metric, updateMetric];
}
