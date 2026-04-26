import { useCallback, useContext } from 'react';
import { TourContext } from './TourProvider';

/**
 * useTourSignal — fire-and-forget hook for posting tour events from action sites.
 *
 * Why not just useTour():
 *  - useTour() throws when no provider is mounted (e.g. component-level tests
 *    that don't wrap with TourProvider). A signal call is a soft side-effect;
 *    a missing provider should never break the user's primary action.
 *  - We read TourContext directly so the React Hooks rule-of-hooks check stays
 *    happy (no conditional hook calls).
 *
 * Usage:
 *   const fireTourSignal = useTourSignal();
 *   await createHighlight(...);
 *   fireTourSignal('highlight_captured');
 *
 * Idempotence:
 *  - Skips re-firing once the underlying signal is already true.
 *    Server is idempotent too, but skipping the network round-trip on every
 *    subsequent highlight / concept attach keeps things tidy.
 *
 * Event name → signal mapping is owned by the server (TOUR_EVENT_TO_SIGNAL).
 * Currently wired:
 *   - highlight_captured       → firstHighlightCaptured
 *   - concept_from_highlight   → conceptFromHighlight
 *   - workspace_organized      → workspaceOrganized
 *
 * Not wired here (handled elsewhere):
 *   - semantic_search_used     → server-side, on the search route
 *   - extension_connected      → defer to server-side detection of extension origin
 */
const EVENT_TO_SIGNAL_KEY = {
  highlight_captured: 'firstHighlightCaptured',
  concept_from_highlight: 'conceptFromHighlight',
  workspace_organized: 'workspaceOrganized',
  semantic_search_used: 'semanticSearchUsed',
  extension_connected: 'extensionConnected'
};

const useTourSignal = () => {
  const tour = useContext(TourContext); // null when no provider; that's fine.

  return useCallback(async (eventType, metadata = {}) => {
    if (!tour || typeof tour.recordEvent !== 'function') return;
    const signalKey = EVENT_TO_SIGNAL_KEY[eventType];
    if (signalKey && tour.state?.signals?.[signalKey]) return;
    try {
      await tour.recordEvent({ eventType, metadata });
    } catch (_err) {
      // Tour signal is best-effort; never surface a failure to the caller.
    }
  }, [tour]);
};

export default useTourSignal;
