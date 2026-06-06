import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { approveAgentConnectSession, getAgentConnectApprovalSession } from '../api/agent';
import { Card, Page } from '../components/ui';

const SCOPE_LABELS = {
  read: 'Read, search, and retrieve your Noeis workspace',
  'agent-write': 'Create drafts, write wiki updates, and add sourced material'
};

const AgentConnectAuthorize = ({ searchOverride = '' }) => {
  const location = useLocation();
  const queryString = searchOverride || location.search;
  const params = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const sessionId = params.get('session') || '';
  const pollSecret = params.get('secret') || '';
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!sessionId) {
        setError('Connection session is missing.');
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
        if (!cancelled) setError(err?.response?.data?.error || 'Failed to load this connection request.');
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
      const data = await approveAgentConnectSession(sessionId, { pollSecret });
      setSession(data.session || session);
      setApproved(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to approve this agent.');
    } finally {
      setApproving(false);
    }
  };

  const status = session?.status || 'pending';
  const canApprove = Boolean(sessionId && pollSecret && session && status === 'pending' && !approved);

  return (
    <Page className="settings-page agent-connect-authorize-page">
      <div className="page-header">
        <p className="muted-label">Connected agents</p>
        <h1>Approve local agent</h1>
        <p className="muted">
          This lets the local agent use Noeis through the same connected-agent token system you can revoke in Settings.
        </p>
      </div>

      <Card className="settings-card agent-connect-authorize-card">
        {loading ? (
          <p className="muted">Loading connection request...</p>
        ) : error && !session ? (
          <>
            <h2>Connection unavailable</h2>
            <p className="muted">{error}</p>
            <Link to="/integrations" className="ui-button ui-button-secondary">Open integrations</Link>
          </>
        ) : (
          <>
            <div className="settings-appearance-header">
              <div>
                <h2>{session?.runtimeLabel || session?.label || 'Local agent'}</h2>
                <p className="muted">
                  {session?.label || 'Local agent'} is asking to connect to this Noeis workspace.
                </p>
              </div>
              <p className="muted-label">{status}</p>
            </div>

            <div className="agent-connect-authorize-card__code">
              <span>Device code</span>
              <strong>{session?.deviceCode || 'Unknown'}</strong>
            </div>

            <div className="agent-connect-authorize-card__scope-list">
              {(session?.scopes || []).map((scope) => (
                <div key={scope} className="agent-connect-authorize-card__scope">
                  <strong>{scope}</strong>
                  <p className="muted small">{SCOPE_LABELS[scope] || scope}</p>
                </div>
              ))}
            </div>

            {approved || status === 'approved' ? (
              <div className="agent-connect-authorize-card__success" role="status">
                <strong>Agent connected.</strong>
                <p className="muted small">Return to your terminal. The CLI will finish writing the MCP config.</p>
              </div>
            ) : status === 'expired' ? (
              <div className="agent-connect-authorize-card__success" role="status">
                <strong>Connection expired.</strong>
                <p className="muted small">Run the connect command again to create a fresh approval request.</p>
              </div>
            ) : (
              <>
                {error ? <p className="form-error">{error}</p> : null}
                <div className="settings-actions">
                  <button
                    type="button"
                    className="ui-button ui-button-primary"
                    onClick={handleApprove}
                    disabled={!canApprove || approving}
                  >
                    {approving ? 'Approving...' : 'Approve agent'}
                  </button>
                  <Link to="/integrations" className="ui-button ui-button-secondary">Cancel</Link>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </Page>
  );
};

export default AgentConnectAuthorize;
