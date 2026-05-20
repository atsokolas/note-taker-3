import React, { useEffect, useMemo, useState } from 'react';
import { buildQualityState } from './wikiQuality';

/**
 * WikiAgentPresence — ambient row at the top of a wiki page that shows
 * the agent's state with a breathing dot. Replaces the old detached
 * "Maintain page" button; the action is folded into the row so the
 * agent always feels present, not summoned.
 *
 * Status derivation:
 *   - 'maintaining'     parent passes isMaintaining=true
 *   - 'error'           aiState.lastError exists and we're not currently working
 *   - 'ready'           draftStatus === 'ready' AND there are pending health signals
 *   - 'idle'            we've drafted before, no signals to review
 *   - 'never_run'       no lastDraftedAt and not currently maintaining
 */

const HEALTH_KEYS = [
  'newItems',
  'unsupportedClaims',
  'missingCitations',
  'staleSections',
  'contradictions'
];

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '';
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.round(diffDay / 30);
  return `${diffMo}mo ago`;
};

const countPendingSignals = (aiState = {}) => {
  const health = aiState.health || {};
  return HEALTH_KEYS.reduce((total, key) => {
    const list = Array.isArray(health[key]) ? health[key] : [];
    return total + list.length;
  }, 0);
};

const deriveStatus = ({ isMaintaining, aiState }) => {
  if (isMaintaining) return 'maintaining';
  if (!aiState) return 'never_run';
  if (aiState.lastError) return 'error';
  const drafted = aiState.lastDraftedAt || aiState.draftStatus === 'ready';
  if (!drafted) return 'never_run';
  return countPendingSignals(aiState) > 0 ? 'ready' : 'idle';
};

const statusCopy = ({ status, aiState, signalCount, qualityState }) => {
  switch (status) {
    case 'maintaining':
      return {
        text: 'Reading your library and updating this page…',
        sub: 'The agent is analyzing relevant sources right now.',
        action: 'Maintaining…',
        actionDisabled: true
      };
    case 'error':
      return {
        text: 'Maintenance failed.',
        sub: String(aiState?.lastError || '').slice(0, 200),
        action: 'Retry',
        actionDisabled: false
      };
    case 'ready':
      if (qualityState?.severity === 'rebuild') {
        return {
          text: 'Needs rebuild',
          sub: qualityState.summary,
          action: 'Run again',
          actionDisabled: false
        };
      }
      if (qualityState?.severity === 'review') {
        return {
          text: 'Needs review',
          sub: qualityState.summary,
          action: 'Run again',
          actionDisabled: false
        };
      }
      if (qualityState?.severity === 'drift') {
        return {
          text: 'Drifting',
          sub: `${signalCount} signal${signalCount === 1 ? '' : 's'} waiting to be incorporated.`,
          action: 'Run again',
          actionDisabled: false
        };
      }
      return {
        text: `${signalCount} signal${signalCount === 1 ? '' : 's'} pending review`,
        sub: aiState?.lastDraftedAt
          ? `Last reviewed ${formatRelativeTime(aiState.lastDraftedAt)}.`
          : 'New material may affect this page.',
        action: 'Run again',
        actionDisabled: false
      };
    case 'idle':
      return {
        text: 'Up to date',
        sub: aiState?.lastDraftedAt
          ? `Reviewed by the agent ${formatRelativeTime(aiState.lastDraftedAt)}.`
          : 'No pending signals.',
        action: 'Run again',
        actionDisabled: false
      };
    case 'never_run':
    default:
      return {
        text: 'The agent hasn’t read this page yet.',
        sub: 'Run maintenance to draft from your library and surface signals.',
        action: 'Maintain page',
        actionDisabled: false
      };
  }
};

const WikiAgentPresence = ({ page, isMaintaining = false, onMaintain }) => {
  // Memoize aiState so a fresh `{}` on every render doesn't invalidate the
  // downstream useMemos.
  const aiState = useMemo(() => page?.aiState || {}, [page]);

  // Re-render every 30s while idle so "X min ago" stays accurate without
  // needing a server push.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (isMaintaining) return undefined;
    const id = setInterval(() => setTick((current) => current + 1), 30000);
    return () => clearInterval(id);
  }, [isMaintaining]);

  const status = useMemo(() => deriveStatus({ isMaintaining, aiState }), [isMaintaining, aiState]);
  const signalCount = useMemo(() => countPendingSignals(aiState), [aiState]);
  const qualityState = useMemo(() => buildQualityState({ page }), [page]);
  // tick is intentionally read so the relative-time labels refresh every 30s.
  const copy = useMemo(
    () => statusCopy({ status, aiState, signalCount, qualityState }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, aiState, signalCount, qualityState, tick]
  );

  return (
    <div
      className="wiki-agent-presence"
      data-status={status}
      role="status"
      aria-live="polite"
      aria-label="Agent status"
    >
      <span className="wiki-agent-presence__dot" aria-hidden="true">
        <span className="wiki-agent-presence__dot-inner" />
      </span>
      <div className="wiki-agent-presence__copy">
        <span className="wiki-agent-presence__text">{copy.text}</span>
        {copy.sub ? <span className="wiki-agent-presence__sub">{copy.sub}</span> : null}
      </div>
      <button
        type="button"
        className="wiki-agent-presence__action"
        onClick={onMaintain}
        disabled={copy.actionDisabled}
        data-testid="wiki-agent-presence-action"
      >
        {copy.action}
      </button>
    </div>
  );
};

export default WikiAgentPresence;
