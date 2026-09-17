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
        title: `${token.label || 'Agent'} authorized`,
        outcome: token.status === 'revoked' || token.revokedAt ? 'Historical approval' : 'Access approved',
        detail: `${(token.scopes || []).includes('agent-write') ? 'Read and write' : 'Read-only'} grant issued. This does not prove the runtime loaded it.`,
        tone: 'quiet',
        at: token.createdAt
      });
    }
    if (token.lastUsedAt) {
      rows.push({
        id: `${id}-used`,
        title: `${token.label || 'Agent'} used NOEIS`,
        outcome: 'Request received',
        detail: 'A successful request was received. This proves that request, not continuous agent presence.',
        tone: 'connected',
        at: token.lastUsedAt
      });
    }
    if (token.revokedAt || token.status === 'revoked') {
      rows.push({
        id: `${id}-revoked`,
        title: `${token.label || 'Agent'} access revoked`,
        outcome: 'Future access stopped',
        detail: 'Completed work and previously retrieved data remain. This grant cannot be restored with Undo.',
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
          <h2 id="connections-activity-title">A record you can come back to</h2>
          <p>Imports, repairs, approvals, and observed requests stay distinct.</p>
        </div>
      </div>

      {loading ? <p className="connections-empty">Loading durable receipts…</p> : null}
      {!loading && error ? <p className="form-error">{error}</p> : null}
      {!loading && !error && activity.length === 0 ? (
        <div className="connections-empty">
          <h3>No connection activity yet.</h3>
          <p>Completed imports and agent access checks will leave a receipt here.</p>
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
                  <summary>Technical receipt</summary>
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
