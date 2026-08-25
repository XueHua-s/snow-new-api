/*
Copyright (C) 2025 QuantumNous

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

import { useCallback, useEffect, useRef, useState } from 'react';
import { API } from '../../helpers';

export const useCodexChannelUsage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError('');

    try {
      const response = await API.get('/api/channel-status/codex-usage', {
        skipErrorHandler: true,
      });
      if (requestRef.current !== requestId) return;
      if (!response?.data?.success) {
        throw new Error(response?.data?.message || 'request failed');
      }
      setData(response.data.data ?? { channels: [], updated_at: 0 });
    } catch (requestError) {
      if (requestRef.current !== requestId) return;
      setError(String(requestError));
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    return () => {
      requestRef.current += 1;
    };
  }, [refresh]);

  return { data, loading, error, refresh };
};
