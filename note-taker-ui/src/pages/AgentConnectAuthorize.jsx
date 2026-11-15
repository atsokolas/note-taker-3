import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { approveAgentConnectSession, getAgentConnectApprovalSession } from '../api/agent';
import { Button, Page, PageHeader } from '../components/ui';

const SCOPE_LABELS = {
  read: 'Read and search everything you have saved and written',
  capture: 'Save links, files and text to your Library, and see your Nightstand',
  'agent-write': 'Save notes, file research to Editions and draft wiki pages',
  work: 'Open Work: its notes, follow-ups, folders and projects'
};

const AgentConnectAuthorize = ({ searchOverride = '' }) => {
  const location = useLocation();
  const queryString = searchOverride || location.search;
  const params = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const sessionId = params.get('session') || '';
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!sessionId) {
        setError('Open this page from the link your agent gives you.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const data = await getAgentConnectApprovalSession(sessionId);
        if (!cancelled) {
          setSession(data.session || null);
          setApproved(data.session?.status === 'approved');
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.error || 'This request could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleApprove = async () => {
    setApproving(true);
    setError('');
    try {
      const data = await approveAgentConnectSession(sessionId, {
        deviceCode: session?.deviceCode || ''
      });
      setSession(data.session || session);
      setApproved(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'That did not go through. Try again.');
    } finally {
      setApproving(false);
    }
  };

  const status = session?.status || 'pending';
  const canApprove = Boolean(sessionId && session?.deviceCode && status === 'pending' && !approved);
  const expiresAt = session?.expiresAt ? new Date(session.expiresAt) : null;
  const expiryLabel = expiresAt && !Number.isNaN(expiresAt.getTime())
    ? expiresAt.toLocaleString()
    : 'Not provided';

  return (
    <Page className="settings-page agent-connect-authorize-page connections-approval-page">
      <PageHeader
        title="Is this the request you started?"
        lede="Approve only if you just asked an agent to connect, and it shows you the same code."
      />

      <section className="agent-connect-authorize-card connections-approval-card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : error && !session ? (
          <>
            <h2>There is no request here.</h2>
            <p className="muted">{error}</p>
            <Link to="/connections#agents">Your agents in Connections →</Link>
          </>
        ) : (
          <>
            <div className="connections-approval-card__account">
              <div>
                <h2>{session?.label || 'An agent'}</h2>
                <p>{session?.runtimeLabel || 'Agent'}, as it describes itself</p>
              </div>
            </div>

            <div className="agent-connect-authorize-card__code">
              <span>Code</span>
              <strong>{session?.deviceCode || 'Unknown'}</strong>
            </div>

            <dl className="connections-approval-facts">
              <div>
                <dt>Connects to</dt>
                <dd>{session?.requestedApiUrl || 'Noeis'}</dd>
              </div>
              <div>
                <dt>Request expires</dt>
                <dd>{expiryLabel}</dd>
              </div>
            </dl>

            <div className="agent-connect-authorize-card__scope-list">
              <h3>It asks to</h3>
              <ul>
                {(session?.scopes || []).map((scope) => <li key={scope}>{SCOPE_LABELS[scope] || scope}</li>)}
              </ul>
            </div>

            {approved || status === 'approved' ? (
              <div className="agent-connect-authorize-card__success" role="status">
                <strong>Approved.</strong>
                <p className="muted small">Go back to the agent. It finishes connecting on its own, and shows as working in Connections once it has.</p>
              </div>
            ) : status === 'expired' ? (
              <div className="agent-connect-authorize-card__success" role="status">
                <strong>This request has expired.</strong>
                <p className="muted small">Ask the agent to connect again for a new one.</p>
              </div>
            ) : (
              <>
                {error ? <p className="form-error">{error}</p> : null}
                <div className="settings-actions">
                  <Button
                    variant="primary"
                    onClick={handleApprove}
                    disabled={!canApprove || approving}
                  >
                    {approving ? 'Approving…' : 'Approve'}
                  </Button>
                  <Link to="/connections#agents">Not now</Link>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </Page>
  );
};

export default AgentConnectAuthorize;
