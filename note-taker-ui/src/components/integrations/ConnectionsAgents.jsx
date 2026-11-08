import React, { useMemo, useState } from 'react';
import { createConnectionHandoff, projectAgentGrant } from './connectionsModel';
import { Button } from '../ui';

const RUNTIMES = [
  ['openclaw', 'OpenClaw'],
  ['codex', 'Codex'],
  ['hermes', 'Hermes'],
  ['claude-code', 'Claude Code'],
  ['opencode', 'OpenCode']
];

const TASKS = [
  'Connect and verify only',
  'Find material I already saved',
  'Prepare an Edition'
];

const runtimeLabel = (runtime = '') => (
  RUNTIMES.find(([value]) => value === runtime)?.[1]
  || String(runtime || 'Agent')
);

const downloadText = (filename, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function ConnectionsAgents({ tokenModel }) {
  const [showHandoff, setShowHandoff] = useState(false);
  const [managedGrantId, setManagedGrantId] = useState('');
  const [revokeGrantId, setRevokeGrantId] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [copyFallback, setCopyFallback] = useState('');
  const [draft, setDraft] = useState({
    label: 'Research companion',
    runtime: 'openclaw',
    scope: 'read',
    task: 'Connect and verify only',
    target: ''
  });
  const grants = useMemo(
    () => (tokenModel.sortedTokens || []).map(token => ({
      token,
      view: projectAgentGrant(token)
    })),
    [tokenModel.sortedTokens]
  );
  const handoff = useMemo(() => createConnectionHandoff(draft), [draft]);

  const updateDraft = (key, value) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  const copy = async (text, successMessage) => {
    setCopyFallback('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopyStatus(successMessage);
    } catch (_error) {
      setCopyFallback(text);
      setCopyStatus('Clipboard unavailable. Select the text below and copy it.');
    }
  };

  if (showHandoff) {
    return (
      <section className="connections-agent-handoff" aria-labelledby="connections-handoff-title">
        <button
          type="button"
          className="connections-back"
          onClick={() => setShowHandoff(false)}
        >
          ← Agents
        </button>
        <div className="connections-detail-grid">
          <div>
            <h2 id="connections-handoff-title" className="connections-display-title">Give this to your agent.</h2>
            <p className="connections-lede">
              The agent sets itself up, then asks you to approve it here. Copying this gives it nothing.
            </p>

            <div className="connections-form-grid">
              <label>
                <span>Name this connection</span>
                <input
                  type="text"
                  maxLength={80}
                  value={draft.label}
                  onChange={event => updateDraft('label', event.target.value)}
                />
              </label>
              <label>
                <span>Where does your agent run?</span>
                <select
                  value={draft.runtime}
                  onChange={event => updateDraft('runtime', event.target.value)}
                >
                  {RUNTIMES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="connections-field">
              <span>What are you connecting it for?</span>
              <select
                value={draft.task}
                onChange={event => updateDraft('task', event.target.value)}
              >
                {TASKS.map(task => <option key={task}>{task}</option>)}
              </select>
            </label>

            <fieldset className="connections-permission-choices">
              <legend>What may it do?</legend>
              <label>
                <input
                  type="radio"
                  name="handoff-scope"
                  value="read"
                  checked={draft.scope === 'read'}
                  onChange={event => updateDraft('scope', event.target.value)}
                />
                <span>
                  <strong>Read</strong>
                  <small>Reads what you saved. Changes nothing.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="handoff-scope"
                  value="agent-write"
                  checked={draft.scope === 'agent-write'}
                  onChange={event => updateDraft('scope', event.target.value)}
                />
                <span>
                  <strong>Read and write</strong>
                  <small>Also saves notes, files research to Editions and drafts wiki pages.</small>
                </span>
              </label>
            </fieldset>

            <label className="connections-field">
              <span>Anything it should know (optional)</span>
              <input
                type="text"
                maxLength={180}
                value={draft.target}
                placeholder="A company, a book, a question"
                onChange={event => updateDraft('target', event.target.value)}
              />
              <small>Goes into the instructions exactly as you type it.</small>
            </label>

            {draft.task === 'Prepare an Edition' && draft.scope === 'read' ? (
              <p className="connections-inline-notice">
                To file an Edition it needs Read and write.
              </p>
            ) : null}

            <div className="connections-actions">
              <Button
                variant="primary"
                onClick={() => copy(handoff.markdown, 'Instructions copied. Nothing was authorized.')}
              >
                Copy instructions
              </Button>
              <button
                type="button"
                className="connections-text-button"
                onClick={() => downloadText(handoff.filename, handoff.markdown, 'text/markdown')}
              >
                Save .md
              </button>
              <button
                type="button"
                className="connections-text-button"
                onClick={() => downloadText('noeis-connection-handoff.json', handoff.json, 'application/json')}
              >
                JSON for an agent
              </button>
            </div>
            {copyStatus ? <p className="connections-copy-status" role="status">{copyStatus}</p> : null}
            {copyFallback ? (
              <textarea
                className="connections-copy-fallback"
                aria-label="Instructions to copy manually"
                readOnly
                value={copyFallback}
                onFocus={event => event.currentTarget.select()}
              />
            ) : null}
            <details className="connections-fold">
              <summary>Read what you are handing over</summary>
              <pre>{handoff.markdown}</pre>
            </details>
          </div>

          <aside className="connections-side-note">
            <h3>What happens</h3>
            <ol>
              <li><p>You paste the instructions into your agent. They hold no password.</p></li>
              <li><p>It sets up its Noeis tools and leaves its other tools alone.</p></li>
              <li><p>It sends you here with a code. You check the code and approve.</p></li>
              <li><p>It reads one thing to prove it works, then stops.</p></li>
            </ol>
            <a href="/skill.md">What the agent reads →</a>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <div className="connections-agents">
      <div className="connections-section-heading">
        <div>
          <h2>Agents</h2>
          <p>Claude, ChatGPT and the others you let read your library.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowHandoff(true)}
        >
          Connect an agent
        </Button>
      </div>

      {tokenModel.tokensLoading ? <p className="connections-empty">Loading agents…</p> : null}
      {!tokenModel.tokensLoading && grants.length === 0 ? (
        <div className="connections-empty">
          <h3>No agent can read your library yet.</h3>
          <p>Connect an agent, give it the instructions, and approve its request here when it asks.</p>
        </div>
      ) : null}

      <div className="connections-rows">
        {grants.map(({ token, view }) => {
          const isManaged = managedGrantId === view.id;
          const isConfirmingRevoke = revokeGrantId === view.id;
          const activity = tokenModel.tokenActionsById?.[view.id];
          return (
            <article key={view.id} className={`connections-row connections-row--${view.tone}`}>
              <div className="connections-row-title">
                <h3>{view.label}</h3>
                <p>{runtimeLabel(view.runtime)} · {view.scopeLabel}</p>
              </div>
              <div className="connections-row-state">
                <span className="connections-state-dot" aria-hidden="true" />
                <strong>{view.stateLabel}</strong>
                <small>{view.detail}</small>
              </div>
              <button
                type="button"
                className="connections-text-button connections-row-action"
                aria-expanded={isManaged}
                onClick={() => setManagedGrantId(current => current === view.id ? '' : view.id)}
              >
                Manage {view.label}
              </button>
              {isManaged ? (
                <div className="connections-row-detail">
                  <dl>
                                        <div><dt>Permission</dt><dd>{view.scopeLabel}</dd></div>
                    <div><dt>Working</dt><dd>{view.ready ? 'Yes, it has reached Noeis' : 'Not yet, it has not reached Noeis'}</dd></div>
                    <div><dt>Expires</dt><dd>{view.expiresAt ? new Date(view.expiresAt).toLocaleString() : 'Never'}</dd></div>
                  </dl>
                  <div className="connections-actions">
                    <button
                      type="button"
                      className="connections-text-button"
                      onClick={() => tokenModel.handleToggleTokenActivity(view.id)}
                    >
                      {tokenModel.expandedTokenId === view.id ? 'Hide activity' : 'Load activity'}
                    </button>
                    {view.status === 'active' ? (
                      <button
                        type="button"
                        className="connections-text-button connections-danger"
                        onClick={() => setRevokeGrantId(view.id)}
                      >
                        Revoke this access
                      </button>
                    ) : null}
                  </div>
                  {tokenModel.tokenActionsLoadingId === view.id ? <p>Loading activity…</p> : null}
                  {activity?.actions?.length ? (
                    <ul className="connections-activity-mini">
                      {activity.actions.slice(0, 8).map(action => (
                        <li key={action.id || `${action.action}-${action.createdAt}`}>
                          <strong>{String(action.action || 'request').replace(/_/g, ' ')}</strong>
                          <span>{action.status || 'unknown'} · {action.createdAt ? new Date(action.createdAt).toLocaleString() : 'time unavailable'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {isConfirmingRevoke ? (
                    <div className="connections-revoke-confirm" role="alert">
                      <strong>Revoke {view.label}?</strong>
                      <p>It stops working at once. What it already saved stays, and what it already read cannot be taken back.</p>
                      <div className="connections-actions">
                        <Button
                          variant="primary"
                          onClick={() => {
                            tokenModel.handleRevokeToken(view.id);
                            setRevokeGrantId('');
                          }}
                        >
                          Revoke
                        </Button>
                        <button
                          type="button"
                          className="connections-text-button"
                          onClick={() => setRevokeGrantId('')}
                        >
                          Keep access
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {tokenModel.tokensError ? <p className="form-error">{tokenModel.tokensError}</p> : null}

      <details className="connections-fold connections-manual-setup">
        <summary>Use a token instead</summary>
        <p>
          For an agent that cannot open the approval page. The token is shown once, so copy it straight into the agent.
        </p>
        <div className="connections-form-grid">
          <label>
            <span>Connection label</span>
            <input
              type="text"
              value={tokenModel.tokenLabel}
              onChange={event => tokenModel.setTokenLabel(event.target.value)}
            />
          </label>
          <label>
            <span>Expiry</span>
            <input
              type="date"
              value={tokenModel.tokenExpiresAt}
              onChange={event => tokenModel.setTokenExpiresAt(event.target.value)}
            />
          </label>
        </div>
        <div className="connections-permission-inline">
          <label>
            <input
              type="checkbox"
              checked={(tokenModel.tokenScopes || []).includes('read')}
              onChange={event => tokenModel.handleScopeChange('read', event.target.checked)}
            />
            Read
          </label>
          <label>
            <input
              type="checkbox"
              checked={(tokenModel.tokenScopes || []).includes('agent-write')}
              onChange={event => tokenModel.handleScopeChange('agent-write', event.target.checked)}
            />
            Write
          </label>
        </div>
        <Button
          disabled={tokenModel.creatingToken}
          onClick={tokenModel.handleCreateToken}
        >
          {tokenModel.creatingToken ? 'Making it…' : 'Make a token'}
        </Button>
        {tokenModel.issuedSecret ? (
          <div className="connections-secret">
            <strong>Your token. It will not be shown again.</strong>
            <pre>{tokenModel.issuedSecret}</pre>
            <button
              type="button"
              className="connections-text-button"
              onClick={() => copy(tokenModel.issuedSecret, 'Copied. Paste it into the agent now.')}
            >
              Copy token
            </button>
          </div>
        ) : null}
      </details>

    </div>
  );
}
