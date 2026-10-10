import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getConsentRequest, decideConsent } from '../api/oauthConsent';
import { Card, Page } from '../components/ui';

const SCOPES = {
  read: { title: 'Read your sources', detail: 'Search and read your Library, exact source passages, highlights, notes, and Wikis.' },
  'agent-write': { title: 'Write to your workspace', detail: 'Save private thoughts on source passages, add research with receipts to Editions, and prepare Wiki sources and candidates for your review. Wiki publication, sharing, deletion, and accepted changes remain in NOEIS.' }
};
const redirect = (url) => window.location.assign(url);

// The return destination is the one detail a look-alike app cannot fake, so it is said plainly.
const returnLine = (to) => {
  if (to?.kind === 'site') return <>After you choose, you'll return to <strong>{to.name}</strong>.</>;
  if (to?.kind === 'local') return 'After you choose, you\'ll return to an app on this computer.';
  if (to?.kind === 'app') return <>After you choose, you'll return to the <strong>{to.name}</strong> app on this computer.</>;
  return null;
};

export default function ConnectAppAuthorize({ navigateToClient = redirect }) {
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
      setError('This connection request is missing. Start connecting again from your app.');
      setLoading(false);
      return undefined;
    }
    getConsentRequest(requestId).then((data) => {
      if (active) setRequest(data);
    }).catch((err) => {
      if (active) setError(err?.response?.status === 404
        ? 'This connection request has expired or is no longer available. Start connecting again from your app.'
        : 'This connection request could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestId, reload]);

  const app = request?.clientName || 'This app';
  const decide = async (approved, scopes) => {
    if (decisionInFlight.current) return;
    decisionInFlight.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await decideConsent(requestId, approved, scopes);
      if (!result?.redirectUrl) throw new Error('Missing return destination');
      setCompleted(true);
      navigateToClient(result.redirectUrl);
    } catch (_err) {
      // A lost response can follow a completed decision. Never automatically replay consent.
      setRequest(null);
      setError('The connection result could not be confirmed. Return to your app and check the connection; start a new request if needed.');
    } finally {
      setSubmitting(false);
    }
  };
  const expiresAt = request?.expiresAt ? new Date(request.expiresAt) : null;
  const expired = expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
  const scopes = Array.isArray(request?.scopes) ? request.scopes : [];
  const supported = scopes.length > 0 && scopes.every((scope) => Boolean(SCOPES[scope]));
  const asksToWrite = scopes.includes('agent-write') && scopes.includes('read');
  const blocked = submitting || expired || !supported;

  return (
    <Page className="settings-page agent-connect-authorize-page connections-approval-page">
      <header className="connections-hub__header">
        <p className="muted-label">Account connection</p>
        <h1>Connect an app to your NOEIS</h1>
        <p>Your reading stays tied to its source. Your own thoughts remain yours.</p>
      </header>
      <Card className="settings-card agent-connect-authorize-card connections-approval-card">
        {loading ? <p role="status">Loading connection request…</p> : completed ? <p role="status">Returning to {app}…</p> : (
          <>
            {request ? <>
              <h2>{app} wants to connect</h2>
              {request.returnTo ? <p>{returnLine(request.returnTo)}{request.clientVerified === false ? ` The name “${app}” comes from the app itself; NOEIS has not checked it.` : null}</p> : null}
              <div className="agent-connect-authorize-card__scope-list">
                {scopes.map((scope) => <div key={scope} className="agent-connect-authorize-card__scope"><strong>{SCOPES[scope]?.title || scope}</strong><p>{SCOPES[scope]?.detail || 'This permission is not supported by this screen.'}</p></div>)}
              </div>
              <p className="connections-approval-note">Connect only if you just asked this app to connect. Connection does not start research or a recurring task. The app must follow your instructions before saving or changing your work. Wiki candidates require your review and acceptance in NOEIS. You can revoke access in Connections.</p>
              {expired ? <p role="alert">This request has expired. Start connecting again from your app.</p> : null}
              {!supported ? <p role="alert">These permissions cannot be approved. Start a new connection request.</p> : null}
              <div className="settings-actions">
                {asksToWrite ? <>
                  <button className="ui-button ui-button-primary" disabled={blocked} onClick={() => decide(true, ['read'])}>Allow reading only</button>
                  <button className="ui-button ui-button-secondary" disabled={blocked} onClick={() => decide(true)}>Allow reading and writing</button>
                </> : <button className="ui-button ui-button-primary" disabled={blocked} onClick={() => decide(true)}>{submitting ? `Returning to ${app}…` : 'Allow connection'}</button>}
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
