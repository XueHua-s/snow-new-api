import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../../helpers';

const REFRESH_INTERVAL_MS = 60_000;

export function useUsageLeaderboard(period) {
  const { t } = useTranslation();
  const activeRequest = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (quiet = false) => {
      if (quiet && activeRequest.current) return;
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;

      if (!quiet) {
        setLoading(true);
        setSnapshot(null);
      }
      setError('');

      try {
        const response = await API.get('/api/usage-leaderboard', {
          params: { period },
          signal: controller.signal,
        });
        if (!response.data?.success) {
          throw new Error(response.data?.message || t('榜单加载失败'));
        }
        setSnapshot(response.data.data);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        const message =
          requestError?.response?.data?.message ||
          requestError?.message ||
          t('榜单加载失败');
        setError(message);
        if (!quiet) showError(message);
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          if (!quiet) setLoading(false);
        }
      }
    },
    [period, t],
  );

  useEffect(() => {
    void load();
    const timer = window.setInterval(
      () => void load(true),
      REFRESH_INTERVAL_MS,
    );
    return () => {
      window.clearInterval(timer);
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [load]);

  return { snapshot, loading, error, reload: load };
}
