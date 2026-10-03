import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getChatGPTConsentRequest, decideChatGPTConsent } from '../api/chatgpt';
import { Card, Page } from '../components/ui';

const SCOPE_LABELS = {
  read: 'Search and read your Library, exact source passages, highlights, notes, and Wikis.',
  'agent-write': 'Save private thoughts on source passages, add research with receipts to Editions, and prepare Wiki sources and candidates for your review. Wiki publication, sharing, deletion, and accepted content changes remain in NOEIS.'
};
const redirect = (url) => window.location.assign(url);

export default function ChatGPTConnectAuthorize({ navigateToClient = redirect }) {
  const location = useLocation();
  const requestId = new URLSearchParams(location.search).get('request') || '';
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [reload, setReload] = useState(0);
  const decisionInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setRequest(null);
    setCompleted(false);
    setError('');
    setLoading(true);
    if (!requestId) {
      setError('This connection request is missing. Start Connect NOEIS again in ChatGPT.');
      setLoading(false);
      return undefined;
    }
    getChatGPTConsentRequest(requestId).then((data) => {
      if (active) setRequest(data);
    }).catch((err) => {
      if (active) setError(err?.response?.status === 404
        ? 'This connection request has expired or is no longer available. Start Connect NOEIS again in ChatGPT.'
        : 'This connection request could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestId, reload]);

  const decide = async (approved) => {
    if (decisionInFlight.current) return;
    decisionInFlight.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await decideChatGPTConsent(requestId, approved);
      if (!result?.redirectUrl) throw new Error('Missing return destination');
      setCompleted(true);
      navigateToClient(result.redirectUrl);
    } catch (_err) {
      // A lost response can follow a completed decision. Never automatically replay consent.
      setRequest(null);
      setError('The connection result could not be confirmed. Return to ChatGPT and check the connection; start a new request if needed.');
    } finally {
      setSubmitting(false);
    }
  };
  const expiresAt = request?.expiresAt ? new Date(request.expiresAt) : null;
  const expired = expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
  const scopes = Array.isArray(request?.scopes) ? request.scopes : [];
  const supported = scopes.length > 0 && scopes.every((scope) => Boolean(SCOPE_LABELS[scope]));

  return (
    <Page className="settings-page agent-connect-authorize-page connections-approval-page">
      <header className="connections-hub__header">
        <p className="muted-label">Account connection</p>
        <h1>Connect your NOEIS to ChatGPT</h1>
        <p>Your reading stays tied to its source. Your own thoughts remain yours.</p>
      </header>
      <Card className="settings-card agent-connect-authorize-card connections-approval-card">
        {loading ? <p role="status">Loading connection request…</p> : completed ? <p role="status">Returning to ChatGPT…</p> : (
          <>
            {request ? <>
              <h2>{request.clientName || 'ChatGPT'} requests access</h2>
              <div className="agent-connect-authorize-card__scope-list">
                {scopes.map((scope) => <div key={scope} className="agent-connect-authorize-card__scope"><strong>{scope === 'read' ? 'Read your sources' : scope === 'agent-write' ? 'Write to your workspace' : scope}</strong><p>{SCOPE_LABELS[scope] || 'This permission is not supported by this screen.'}</p></div>)}
              </div>
              <p className="connections-approval-note">Connect only if you started this request in ChatGPT. Connection does not start research or a recurring task. ChatGPT must follow your instructions before saving or changing your work. Wiki candidates require your review and acceptance in NOEIS. You can revoke access in Connections.</p>
              {expired ? <p role="alert">This request has expired. Start Connect NOEIS again in ChatGPT.</p> : null}
              {!supported ? <p role="alert">These permissions cannot be approved. Start a new connection request.</p> : null}
              <div className="settings-actions">
                <button className="ui-button ui-button-primary" disabled={submitting || expired || !supported} onClick={() => decide(true)}>{submitting ? 'Returning to ChatGPT…' : 'Allow connection'}</button>
                <button className="ui-button ui-button-secondary" disabled={submitting} onClick={() => decide(false)}>Deny connection</button>
              </div>
            </> : null}
            {error ? <p role="alert">{error}</p> : null}
            {!request && requestId && !error.startsWith('The connection result') ? <button className="ui-button ui-button-secondary" onClick={() => setReload((value) => value + 1)}>Try loading again</button> : null}
            <Link to="/connections#agents" className="ui-button ui-button-secondary">Open Connections</Link>
          </>
        )}
      </Card>
    </Page>
  );
}
