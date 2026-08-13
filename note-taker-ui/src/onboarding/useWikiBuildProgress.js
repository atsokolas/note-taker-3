import { useCallback, useEffect, useRef, useState } from 'react';
import { getWikiPageBuildStatus } from '../api/wiki';

/**
 * useWikiBuildProgress — watch a detached page build.
 *
 * Onboarding starts a build and walks the user through the product while it runs,
 * so nothing here blocks: the caller renders whatever it likes and reads `state`
 * to decide whether the wiki is reachable yet.
 *
 * Terminal states are `ready` and `error`. Polling stops on both, and on unmount.
 */

const POLL_INTERVAL_MS = 2500;
// A build that never reports terminal state must not poll forever. At the default
// interval this gives a build ~10 minutes before we stop and tell the user plainly.
const MAX_POLLS = 240;

const TERMINAL = new Set(['ready', 'error']);

const useWikiBuildProgress = (pageId, { enabled = true, intervalMs = POLL_INTERVAL_MS } = {}) => {
  const [state, setState] = useState({
    status: pageId ? 'maintaining' : 'idle',
    error: '',
    errorCode: '',
    page: null,
    timedOut: false
  });
  const pollCountRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    pollCountRef.current = 0;
    if (!pageId || !enabled) return undefined;

    setState(prev => ({ ...prev, status: 'maintaining', timedOut: false }));

    let timer = null;

    const poll = async () => {
      if (cancelledRef.current) return;
      pollCountRef.current += 1;
      try {
        const next = await getWikiPageBuildStatus(pageId);
        if (cancelledRef.current) return;
        setState({
          status: next.status,
          error: next.error,
          errorCode: next.errorCode,
          page: next.page,
          timedOut: false
        });
        if (TERMINAL.has(next.status)) return;
      } catch (_error) {
        // A dropped poll is not a failed build — the request may just have blipped.
        // Keep polling; the attempt counter still bounds how long we try.
        if (cancelledRef.current) return;
      }
      if (pollCountRef.current >= MAX_POLLS) {
        setState(prev => ({ ...prev, timedOut: true }));
        return;
      }
      timer = window.setTimeout(poll, intervalMs);
    };

    poll();

    return () => {
      cancelledRef.current = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, intervalMs, pageId]);

  const retry = useCallback(() => {
    pollCountRef.current = 0;
    setState(prev => ({ ...prev, status: 'maintaining', timedOut: false, error: '' }));
  }, []);

  return {
    ...state,
    isBuilding: state.status === 'maintaining' || state.status === 'drafting',
    isReady: state.status === 'ready',
    isFailed: state.status === 'error' || state.timedOut,
    retry
  };
};

export default useWikiBuildProgress;
export { POLL_INTERVAL_MS, MAX_POLLS };
