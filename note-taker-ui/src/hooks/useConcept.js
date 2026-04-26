import { useCallback, useEffect, useRef, useState } from 'react';
import { getConcept } from '../api/concepts';

/**
 * useConcept(name, { enabled, initial })
 *
 * `initial` lets the caller seed the concept synchronously so the manuscript
 * can render its title / description on the very first paint instead of
 * showing a skeleton until the network call returns. Pass the row from the
 * already-loaded concepts index list — it has enough fields (name, _id,
 * description) to populate the visible header while the full payload streams
 * in. We still revalidate against the server every time `name` changes.
 */
const useConcept = (name, options = {}) => {
  const { enabled = true, initial = null } = options;
  const [concept, setConcept] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastFetchedNameRef = useRef('');

  const fetchConcept = useCallback(async () => {
    if (!enabled || !name) return;
    setLoading(true);
    setError('');
    try {
      const data = await getConcept(name);
      setConcept(data);
      lastFetchedNameRef.current = name;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load concept.');
    } finally {
      setLoading(false);
    }
  }, [enabled, name]);

  useEffect(() => {
    if (!enabled || !name) {
      setConcept(null);
      setLoading(false);
      setError('');
      lastFetchedNameRef.current = '';
      return;
    }
    // When name changes, swap to the caller-provided seed (if any) immediately
    // so the header repaints with the new concept's title. The fetch then
    // confirms / fills in the rest. Without this, switching concepts shows the
    // previous concept's data until the network round-trip completes.
    if (lastFetchedNameRef.current !== name) {
      setConcept(initial);
    }
    fetchConcept();
  }, [enabled, fetchConcept, initial, name]);

  return { concept, loading, error, refresh: fetchConcept, setConcept };
};

export default useConcept;
