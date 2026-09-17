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
      const data = await approveAgentConnectSession(sessionId, {
        deviceCode: session?.deviceCode || ''
      });
      setSession(data.session || session);
      setApproved(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to approve this agent.');
    } finally {
      setApproving(false);
    }
  };

  const status = session?.status || 'pending';
  const canApprove = Boolean(sessionId && session?.deviceCode && status === 'pending' && !approved);
  const readOnly = (session?.scopes || []).length === 1 && session.scopes[0] === 'read';
  const permissionLabel = readOnly ? 'Read only' : 'Read and write';
  const expiresAt = session?.expiresAt ? new Date(session.expiresAt) : null;
  const expiryLabel = expiresAt && !Number.isNaN(expiresAt.getTime())
    ? expiresAt.toLocaleString()
    : 'Not provided';

  return (
    <Page className="settings-page agent-connect-authorize-page connections-approval-page">
      <header className="connections-hub__header">
        <p className="muted-label">Human approval</p>
        <h1>Is this the request you started?</h1>
        <p>Check the runtime, account destination, comparison code, and actual permission before approving.</p>
      </header>

      <Card className="settings-card agent-connect-authorize-card connections-approval-card">
        {loading ? (
          <p className="muted">Loading connection request...</p>
        ) : error && !session ? (
          <>
            <h2>Connection unavailable</h2>
            <p className="muted">{error}</p>
            <Link to="/connections#agents" className="ui-button ui-button-secondary">Open Connections</Link>
          </>
        ) : (
          <>
            <div className="connections-approval-card__account">
              <div>
                <p className="muted-label">Connection requesting access</p>
                <h2>{session?.label || 'Local agent'}</h2>
                <p>{session?.runtimeLabel || 'Agent runtime'} · self-reported</p>
              </div>
              <p className="muted-label">{status}</p>
            </div>

            <div className="agent-connect-authorize-card__code">
              <span>Comparison code</span>
              <strong>{session?.deviceCode || 'Unknown'}</strong>
            </div>

            <dl className="connections-approval-facts">
              <div>
                <dt>Actual permission request</dt>
                <dd>{permissionLabel}</dd>
              </div>
              <div>
                <dt>NOEIS API</dt>
                <dd>{session?.requestedApiUrl || 'Default NOEIS service'}</dd>
              </div>
              <div>
                <dt>Request expires</dt>
                <dd>{expiryLabel}</dd>
              </div>
              <div>
                <dt>After connecting</dt>
                <dd>Verify access, then stop</dd>
              </div>
            </dl>

            <div className="agent-connect-authorize-card__scope-list">
              {(session?.scopes || []).map((scope) => (
                <div key={scope} className="agent-connect-authorize-card__scope">
                  <strong>{scope}</strong>
                  <p className="muted small">{SCOPE_LABELS[scope] || scope}</p>
                </div>
              ))}
            </div>
            <p className="connections-approval-note">
              The runtime and connection name are self-reported. Approval creates this exact grant; it does not prove the runtime loaded its tools or start a task.
            </p>

            {approved || status === 'approved' ? (
              <div className="agent-connect-authorize-card__success" role="status">
                <strong>Access approved.</strong>
                <p className="muted small">Return to the agent. It still needs to load its tools and call connection_info before the connection is verified.</p>
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
                    {approving ? 'Approving...' : `Approve ${readOnly ? 'read access' : 'read and write access'}`}
                  </button>
                  <Link to="/connections#agents" className="ui-button ui-button-secondary">Decline for now</Link>
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
