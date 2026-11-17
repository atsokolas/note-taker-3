import React, { useEffect, useMemo, useState } from 'react';
import { listImportSessions } from '../../api/imports';
import { projectConnectionActivity } from './connectionsModel';

const formatDate = (value) => {
  if (!value) return 'Time unavailable';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Time unavailable' : parsed.toLocaleString();
};

const projectAgentActivity = (tokens = []) => (
  (Array.isArray(tokens) ? tokens : []).flatMap((token) => {
    const id = String(token.id || token._id || token.label || 'agent');
    const rows = [];
    if (token.createdAt) {
      rows.push({
        id: `${id}-approved`,
        title: `${token.label || 'Agent'} approved`,
        outcome: (token.scopes || []).includes('agent-write') ? 'Read and write' : 'Read only',
        detail: 'You approved it. It shows as working once it reaches Noeis.',
        tone: 'quiet',
        at: token.createdAt
      });
    }
    if (token.lastUsedAt) {
      rows.push({
        id: `${id}-used`,
        title: `${token.label || 'Agent'} used Noeis`,
        outcome: 'Last request',
        detail: 'The most recent time it read or saved something.',
        tone: 'connected',
        at: token.lastUsedAt
      });
    }
    if (token.revokedAt || token.status === 'revoked') {
      rows.push({
        id: `${id}-revoked`,
        title: `${token.label || 'Agent'} revoked`,
        outcome: 'Stopped',
        detail: 'What it saved stays. To use it again, connect it again.',
        tone: 'warning',
        at: token.revokedAt || token.updatedAt
      });
    }
    return rows;
  })
);

export default function ConnectionsActivity({ tokens = [] }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const rows = await listImportSessions({ limit: 30 });
        if (!cancelled) setSessions(Array.isArray(rows) ? rows : []);
      } catch (requestError) {
        if (!cancelled) {
          setSessions([]);
          setError(requestError?.response?.data?.error || 'Activity could not be loaded.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activity = useMemo(() => (
    [
      ...projectConnectionActivity({ sessions }),
      ...projectAgentActivity(tokens)
    ].sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
  ), [sessions, tokens]);

  return (
    <section className="connections-activity" aria-labelledby="connections-activity-title">
      <div className="connections-section-heading">
        <div>
          <h2 id="connections-activity-title">Activity</h2>
          <p>Imports and agents, newest first.</p>
        </div>
      </div>

      {loading ? <p className="connections-empty">Loading…</p> : null}
      {!loading && error ? <p className="form-error">{error}</p> : null}
      {!loading && !error && activity.length === 0 ? (
        <div className="connections-empty">
          <h3>Nothing yet.</h3>
          <p>Each import and each agent you approve is listed here.</p>
        </div>
      ) : null}

      <div className="connections-activity-list">
        {activity.map(item => (
          <article key={item.id} className={`connections-activity-row connections-activity-row--${item.tone}`}>
            <time dateTime={item.at || undefined}>{formatDate(item.at)}</time>
            <div>
              <h3>{item.title}</h3>
              <strong>{item.outcome}</strong>
              <p>{item.detail}</p>
              {item.receipt ? (
                <details className="connections-fold">
                  <summary>Details</summary>
                  <dl className="connections-receipt-facts">
                    <div><dt>Receipt</dt><dd>{item.receipt.id || item.id}</dd></div>
                    <div><dt>Status</dt><dd>{item.receipt.status || item.outcome}</dd></div>
                    <div><dt>Summary</dt><dd>{item.receipt.summary || item.detail}</dd></div>
                  </dl>
                </details>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
