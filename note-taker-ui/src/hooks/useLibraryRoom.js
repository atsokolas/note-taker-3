import { useCallback, useEffect, useRef, useState } from 'react';
import { getLibraryRelevance, getLibraryRoom, getLibraryShelves } from '../api/libraryRelevance';
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
  piles: { later: [], setAside: [] },
  feedTopics: [],
  nextCursor: null,
  hasMore: false
});

const stateFrom = (payload, includeSources) => ({
  loading: false,
  loadingMore: false,
  error: '',
  paginationError: '',
  sources: includeSources ? payload.sources : [],
  coverage: includeSources ? payload.coverage : null,
  counts: includeSources ? payload.counts : {},
  folders: payload.shelves.folders,
  shelfCounts: payload.shelves.counts,
  piles: {
    later: payload.shelves.piles?.later || [],
    setAside: payload.shelves.piles?.setAside || []
  },
  feedTopics: payload.shelves.feedTopics || [],
  nextCursor: includeSources ? payload.nextCursor : null,
  hasMore: includeSources ? payload.hasMore : false
});

const useLibraryRoom = ({
  view = 'recent',
  showSuppressed = false,
  enabled = true,
  includeSources = true
} = {}) => {
  const [state, setState] = useState(emptyRoom);
  const requestRef = useRef(0);

  const load = useCallback(async ({ force = false } = {}) => {
    if (!enabled) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    try {
      const payload = includeSources
        ? await getLibraryRoom({ view, limit: view === 'needs_review' ? 3 : 40, showSuppressed, force })
        : await getLibraryShelves({ showSuppressed, force });
      if (requestRef.current !== requestId) return;
      setState(stateFrom(payload, includeSources));
    } catch (error) {
      if (requestRef.current !== requestId) return;
      setState(previous => ({
        ...previous,
        loading: false,
        error: error?.response?.data?.error || error?.message || 'Could not load Library.'
      }));
    }
  }, [enabled, includeSources, showSuppressed, view]);

  useEffect(() => {
    if (!enabled) return undefined;
    setState(emptyRoom());
    load();
    return () => {
      requestRef.current += 1;
    };
  }, [enabled, load]);

  const refresh = useCallback(() => load({ force: true }), [load]);

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

  const upsertPileArticle = useCallback((article, placement) => {
    const id = String(article?._id || article?.id || '').trim();
    if (!id) return;
    setState((previous) => {
      const without = (list = []) => list.filter((item) => String(item._id || item.id) !== id);
      const later = without(previous.piles?.later);
      const setAside = without(previous.piles?.setAside);
      const row = { ...article, _id: id, placement };
      if (placement === 'later') later.push(row);
      if (placement === 'setAside') setAside.unshift(row);
      return {
        ...previous,
        piles: { later, setAside }
      };
    });
  }, []);

  const loadMore = useCallback(async () => {
    if (!enabled || !includeSources || state.loadingMore || !state.hasMore || !state.nextCursor) return;
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
  }, [enabled, includeSources, showSuppressed, state.hasMore, state.loadingMore, state.nextCursor, view]);

  return { ...state, loadMore, refresh, adjustShelfCount, upsertPileArticle };
};

export default useLibraryRoom;
