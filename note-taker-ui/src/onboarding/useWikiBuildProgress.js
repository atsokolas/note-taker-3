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
// A build that never reports terminal state must not poll forever.
//
// This was ~10 minutes, which is far longer than anyone will sit in front of a
// spinner and longer than the server now takes to record a stalled build as failed
// (4 minutes). Give the server's own verdict time to land, then stop: roughly five
// minutes at the default interval.
const MAX_POLLS = 120;

const TERMINAL = new Set(['ready', 'error']);

/**
 * A status is only terminal for *this* build if the page also reports finishing at
 * or after the moment this build started.
 *
 * The build passes through `ready` before publication decides whether to promote
 * it. Latching the first `ready` told a user on production that their page was
 * ready while it was in fact rejected moments later, and the poll had already
 * stopped, so the banner never corrected itself. `startedAt` comes from the 202
 * that accepted the build.
 */
const isTerminalForThisBuild = ({ status, completedAt }, startedAt) => {
  if (!TERMINAL.has(status)) return false;
  if (!startedAt) return true;
  if (!completedAt) return false;
  const finished = new Date(completedAt).getTime();
  const began = new Date(startedAt).getTime();
  if (!Number.isFinite(finished) || !Number.isFinite(began)) return true;
  return finished >= began;
};

const useWikiBuildProgress = (pageId, { enabled = true, intervalMs = POLL_INTERVAL_MS, startedAt = null } = {}) => {
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
        const settled = isTerminalForThisBuild(next, startedAt);
        setState({
          // Do not show a terminal status this build has not actually reached.
          // A mid-flight `ready` is not this build finishing.
          status: settled ? next.status : 'maintaining',
          error: settled ? next.error : '',
          errorCode: settled ? next.errorCode : '',
          page: next.page,
          timedOut: false
        });
        if (settled) return;
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
  }, [enabled, intervalMs, pageId, startedAt]);

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
