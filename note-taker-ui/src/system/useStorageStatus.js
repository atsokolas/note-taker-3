import { useEffect, useState } from 'react';
import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

// Storage is quiet when healthy. A server warning shares the existing status door.
export const useStorageStatus = (enabled) => {
  const [failure, setFailure] = useState(null);
  useEffect(() => {
    if (!enabled) { setFailure(null); return undefined; }
    let cancelled = false;
    let timer;
    const refresh = async () => {
      try {
        const { data } = await api.get('/api/system/storage', getAuthHeaders());
        if (!cancelled) {
          const message = data?.storage?.message || '';
          setFailure(previous => previous?.message === message ? previous : message
            ? { stage: 'storage', source: 'storage', message, retryable: false }
            : null);
        }
      } catch (_error) {
        // A failed status request is not evidence that saving is broken.
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 5 * 60 * 1000);
      }
    };
    refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled]);
  return failure;
};
