import { useCallback, useEffect, useRef, useState } from 'react';
import { getLibraryRelevance, getLibraryRoom } from '../api/libraryRelevance';
import { appendUniqueSourceRows } from '../components/library/librarySourceIdentity';

const emptyRoom = () => ({
  loading: true,
  loadingMore: false,
  error: '',
  paginationError: '',
  sources: [],
  coverage: null,
  counts: {},
  folders: [],
  shelfCounts: {},
  nextCursor: null,
  hasMore: false
});

const useLibraryRoom = ({ view = 'recent', showSuppressed = false, enabled = true } = {}) => {
  const [state, setState] = useState(emptyRoom);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setState(emptyRoom());
    getLibraryRoom({ view, limit: view === 'needs_review' ? 3 : 40, showSuppressed })
      .then(payload => {
        if (requestRef.current !== requestId) return;
        setState({
          loading: false,
          loadingMore: false,
          error: '',
          paginationError: '',
          sources: payload.sources,
          coverage: payload.coverage,
          counts: payload.counts,
          folders: payload.shelves.folders,
          shelfCounts: payload.shelves.counts,
          nextCursor: payload.nextCursor,
          hasMore: payload.hasMore
        });
      })
      .catch(error => {
        if (requestRef.current !== requestId) return;
        setState(previous => ({
          ...previous,
          loading: false,
          error: error?.response?.data?.error || error?.message || 'Could not load Library.'
        }));
      });
    return () => {
      if (requestRef.current === requestId) requestRef.current += 1;
    };
  }, [enabled, showSuppressed, view]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    try {
      const payload = await getLibraryRoom({ view, limit: view === 'needs_review' ? 3 : 40, showSuppressed, force: true });
      if (requestRef.current !== requestId) return;
      setState({
        loading: false,
        loadingMore: false,
        error: '',
        paginationError: '',
        sources: payload.sources,
        coverage: payload.coverage,
        counts: payload.counts,
        folders: payload.shelves.folders,
        shelfCounts: payload.shelves.counts,
        nextCursor: payload.nextCursor,
        hasMore: payload.hasMore
      });
    } catch (error) {
      if (requestRef.current !== requestId) return;
      setState(previous => ({
        ...previous,
        error: error?.response?.data?.error || error?.message || 'Could not load Library.'
      }));
    }
  }, [enabled, showSuppressed, view]);

  const adjustShelfCount = useCallback((key, delta) => {
    setState((previous) => {
      const current = Number(previous.shelfCounts?.[key]);
      if (!Number.isFinite(current)) return previous;
      return {
        ...previous,
        shelfCounts: {
          ...previous.shelfCounts,
          [key]: Math.max(0, current + delta)
        }
      };
    });
  }, []);

  const loadMore = useCallback(async () => {
    if (!enabled || state.loadingMore || !state.hasMore || !state.nextCursor) return;
    const requestId = requestRef.current;
    setState(previous => ({ ...previous, loadingMore: true, paginationError: '' }));
    try {
      const payload = await getLibraryRelevance({
        view,
        limit: 40,
        sourceScope: 'mixed',
        showSuppressed,
        cursor: state.nextCursor
      });
      if (requestRef.current !== requestId) return;
      setState(previous => ({
        ...previous,
        loadingMore: false,
        sources: appendUniqueSourceRows(previous.sources, payload.sources),
        coverage: payload.coverage || previous.coverage,
        counts: payload.counts || previous.counts,
        nextCursor: payload.nextCursor,
        hasMore: payload.hasMore
      }));
    } catch (error) {
      if (requestRef.current !== requestId) return;
      setState(previous => ({
        ...previous,
        loadingMore: false,
        paginationError: error?.response?.data?.error || 'Could not load more sources.'
      }));
    }
  }, [enabled, showSuppressed, state.hasMore, state.loadingMore, state.nextCursor, view]);

  return { ...state, loadMore, refresh, adjustShelfCount };
};

export default useLibraryRoom;
