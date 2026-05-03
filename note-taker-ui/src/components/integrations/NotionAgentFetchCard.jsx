import React, { useEffect, useState } from 'react';
import { Button } from '../ui';

/**
 * NotionAgentFetchCard — owner-facing surface for the agent-mediated Notion
 * fetch (PR #20 server skill). Replaces the previous one-line "<button>" +
 * "<p className=muted>summary</p>" pair with a real status card:
 *
 *   - Status pill (success / partial / error / no-op) with color-coded tone
 *   - Counts breakdown (created / updated / skipped / failed)
 *   - Persisted "last fetched" timestamp in localStorage so users see
 *     "5 min ago" between sessions without us round-tripping the server
 *   - Expandable error list when result.failed > 0
 *
 * Stays decoupled from DataIntegrations' larger state machine: caller passes
 * { fetching, result, onFetch, disabled }; component owns its own
 * presentation state (errors-expanded, last-fetched cache).
 */

const STORAGE_KEY = 'noeis.notion.lastAgentFetchAt.v1';

const formatRelativeTime = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const deltaMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (deltaMs < 30 * 1000) return 'just now';
  if (deltaMs < hour) return `${Math.max(1, Math.round(deltaMs / minute))}m ago`;
  if (deltaMs < day) return `${Math.max(1, Math.round(deltaMs / hour))}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const STATUS_TONES = {
  success: { label: 'Up to date', tone: 'positive' },
  partial_failure: { label: 'Partial failure', tone: 'warning' },
  error: { label: 'Failed', tone: 'danger' },
  no_connection: { label: 'No connection', tone: 'neutral' },
  token_invalid: { label: 'Reconnect Notion', tone: 'warning' },
  search_failed: { label: 'Search failed', tone: 'danger' }
};

const NotionAgentFetchCard = ({
  connected = false,
  fetching = false,
  result = null,
  disabled = false,
  onFetch
}) => {
  const [lastFetchedAt, setLastFetchedAt] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) || '';
    } catch (_err) {
      return '';
    }
  });
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  // Persist last-fetch timestamp whenever a result lands.
  useEffect(() => {
    if (!result || !['success', 'partial_failure'].includes(result.status)) return;
    const now = new Date().toISOString();
    try {
      window.localStorage.setItem(STORAGE_KEY, now);
    } catch (_err) {
      // localStorage failure is harmless; the in-memory value still drives
      // the next render until reload.
    }
    setLastFetchedAt(now);
  }, [result]);

  // Recompute the "X min ago" string at most once per minute so the chip
  // doesn't go stale while the page sits idle. The tick state isn't read
  // directly — it just triggers a re-render where formatRelativeTime is
  // called inline below against the latest wall-clock time.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastFetchedAt) return undefined;
    const id = window.setInterval(() => setTick((value) => value + 1), 60 * 1000);
    return () => window.clearInterval(id);
  }, [lastFetchedAt]);
  const lastFetchedLabel = formatRelativeTime(lastFetchedAt);

  const statusInfo = result ? STATUS_TONES[result.status] : null;
  const counts = result || {};
  const errors = Array.isArray(result?.errors) ? result.errors : [];

  // No-op edge case: success but everything skipped — surface "all up to date"
  // rather than the generic "Imported 0" empty summary.
  const isNoChange = result?.status === 'success'
    && Number(result.created || 0) === 0
    && Number(result.updated || 0) === 0
    && Number(result.skipped || 0) >= 0
    && Number(result.failed || 0) === 0;

  return (
    <div className="notion-agent-fetch-card" data-testid="notion-agent-fetch-card">
      <div className="notion-agent-fetch-card__head">
        <div className="notion-agent-fetch-card__copy">
          <span className="notion-agent-fetch-card__eyebrow">Agent · Notion</span>
          <h4 className="notion-agent-fetch-card__title">Let the agent fetch your pages</h4>
          <p className="notion-agent-fetch-card__body muted small">
            Pulls every Notion page you can read. Pages whose Notion edit time
            hasn't changed since the last fetch are skipped — re-running is cheap.
          </p>
        </div>
        <div className="notion-agent-fetch-card__cta">
          <Button
            type="button"
            variant="primary"
            onClick={onFetch}
            disabled={disabled || fetching || !connected}
            data-testid="notion-agent-fetch-card-button"
          >
            {fetching ? 'Fetching…' : 'Fetch now'}
          </Button>
          {lastFetchedLabel ? (
            <span
              className="notion-agent-fetch-card__last-fetched muted small"
              data-testid="notion-agent-fetch-card-last-fetched"
            >
              Last fetched {lastFetchedLabel}
            </span>
          ) : null}
        </div>
      </div>

      {!connected ? (
        <p className="muted small">
          Connect Notion above first, then run the agent fetch from here.
        </p>
      ) : null}

      {result ? (
        <div
          className={`notion-agent-fetch-card__result is-${statusInfo?.tone || 'neutral'}`}
          data-testid="notion-agent-fetch-card-result"
        >
          <div className="notion-agent-fetch-card__result-head">
            {statusInfo ? (
              <span
                className={`notion-agent-fetch-card__pill notion-agent-fetch-card__pill--${statusInfo.tone}`}
              >
                {statusInfo.label}
              </span>
            ) : null}
            <span className="notion-agent-fetch-card__summary">
              {isNoChange
                ? `All ${counts.skipped || 0} page${counts.skipped === 1 ? '' : 's'} already up to date.`
                : (result.summary || '')}
            </span>
          </div>

          {/* Show counts only when there's something interesting to show; */}
          {/* skip the chip row entirely on no_connection / token_invalid / search_failed. */}
          {['success', 'partial_failure'].includes(result.status) && (
            <div className="notion-agent-fetch-card__counts">
              <span className="notion-agent-fetch-card__count">
                <strong>{counts.created || 0}</strong> created
              </span>
              <span className="notion-agent-fetch-card__count">
                <strong>{counts.updated || 0}</strong> updated
              </span>
              <span className="notion-agent-fetch-card__count">
                <strong>{counts.skipped || 0}</strong> skipped
              </span>
              {Number(counts.failed || 0) > 0 ? (
                <span className="notion-agent-fetch-card__count is-danger">
                  <strong>{counts.failed}</strong> failed
                </span>
              ) : null}
            </div>
          )}

          {errors.length > 0 ? (
            <div className="notion-agent-fetch-card__errors">
              <button
                type="button"
                className="notion-agent-fetch-card__errors-toggle"
                aria-expanded={errorsExpanded}
                onClick={() => setErrorsExpanded((prev) => !prev)}
              >
                {errorsExpanded ? 'Hide' : 'Show'} {errors.length} error{errors.length === 1 ? '' : 's'}
              </button>
              {errorsExpanded ? (
                <ul className="notion-agent-fetch-card__errors-list">
                  {errors.slice(0, 25).map((entry, idx) => (
                    <li key={`${entry.pageId || 'err'}-${idx}`}>
                      {entry.pageId ? (
                        <code className="notion-agent-fetch-card__error-page">{entry.pageId}</code>
                      ) : null}
                      <span>{entry.message || 'Unknown error'}</span>
                    </li>
                  ))}
                  {errors.length > 25 ? (
                    <li className="muted small">…and {errors.length - 25} more.</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default NotionAgentFetchCard;
