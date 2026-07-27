import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getKnowledgeMovements } from '../../api/knowledgeMovements';
import { KnowledgeMovementLead } from './KnowledgeMovementCard';

const WikiMovementReturnSurface = ({ limit = 3, onPresenceChange }) => {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getKnowledgeMovements({ limit });
      if (!mountedRef.current) return;
      const next = Array.isArray(result?.movements) ? result.movements : [];
      setMovements(next);
      onPresenceChange?.(next.length > 0);
    } catch (_error) {
      if (!mountedRef.current) return;
      setMovements([]);
      setError('Failed to load consequential changes.');
      onPresenceChange?.(false);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [limit, onPresenceChange]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  return (
    <KnowledgeMovementLead
      movements={movements}
      loading={loading}
      error={error}
      onRetry={load}
    />
  );
};

export default WikiMovementReturnSurface;
