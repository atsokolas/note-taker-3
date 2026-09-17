import React, { useMemo, useState } from 'react';
import { createConnectionHandoff, projectAgentGrant } from './connectionsModel';

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

const resolveTokenId = (token = {}) => String(token.id || token._id || '');

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

export default function ConnectionsAgents({ tokenModel, onOpenTaskLink = null }) {
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
            <p className="muted-label">A beginning, not a credential</p>
            <h2 id="connections-handoff-title" className="connections-display-title">Give this to your agent.</h2>
            <p className="connections-lede">
              It prepares the supported setup. You approve the real access. Copying this grants nothing.
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
                  <strong>Read NOEIS</strong>
                  <small>Retrieve through read-scoped endpoints. No content writes.</small>
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
                  <small>Broader access to real agent-write operations, not suggestions only.</small>
                </span>
              </label>
            </fieldset>

            <label className="connections-field">
              <span>Optional target or context</span>
              <input
                type="text"
                maxLength={180}
                value={draft.target}
                placeholder="Only include text you intend to hand over"
                onChange={event => updateDraft('target', event.target.value)}
              />
              <small>Free text may be private. It is included exactly as shown below.</small>
            </label>

            {draft.task === 'Prepare an Edition' && draft.scope === 'read' ? (
              <p className="connections-inline-notice">
                Read-only can inspect Editions. Filing one requires a separate explicit write grant.
              </p>
            ) : null}

            <div className="connections-actions">
              <button
                type="button"
                className="ui-button ui-button-primary"
                onClick={() => copy(handoff.markdown, 'Instructions copied. Nothing was authorized.')}
              >
                Copy instructions
              </button>
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
            <p className="muted-label">A handoff with a clear finish</p>
            <ol>
              <li><span>01</span><p><strong>You give the instructions.</strong><br />No secret is included.</p></li>
              <li><span>02</span><p><strong>The agent prepares access.</strong><br />It preserves other tools.</p></li>
              <li><span>03</span><p><strong>You approve in NOEIS.</strong><br />The exact scope is visible.</p></li>
              <li><span>04</span><p><strong>It proves one metadata read.</strong><br />Then it stops.</p></li>
            </ol>
            <a href="/skill.md">Read the agent-side guide →</a>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <div className="connections-agents">
      <div className="connections-section-heading">
        <div>
          <h2>Agents you have authorized</h2>
          <p>Access is not the same as being online.</p>
        </div>
        <button
          type="button"
          className="ui-button ui-button-primary"
          onClick={() => setShowHandoff(true)}
        >
          Give instructions
        </button>
      </div>

      {tokenModel.tokensLoading ? <p className="connections-empty">Loading grants…</p> : null}
      {!tokenModel.tokensLoading && grants.length === 0 ? (
        <div className="connections-empty">
          <h3>No agent grants yet.</h3>
          <p>Give your agent the setup brief, then approve the exact request here.</p>
        </div>
      ) : null}

      <div className="connections-rows">
        {grants.map(({ token, view }) => {
          const isManaged = managedGrantId === view.id;
          const isConfirmingRevoke = revokeGrantId === view.id;
          const activity = tokenModel.tokenActionsById?.[view.id];
          return (
            <article key={view.id} className={`connections-row connections-row--${view.tone}`}>
              <div className="connections-sigil" aria-hidden="true">◇</div>
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
                    <div><dt>Grant</dt><dd>{view.id}</dd></div>
                    <div><dt>Permission</dt><dd>{view.scopeLabel}</dd></div>
                    <div><dt>Readiness</dt><dd>{view.ready ? 'A request reached NOEIS' : 'No request proof yet'}</dd></div>
                    <div><dt>Expiry</dt><dd>{view.expiresAt ? new Date(view.expiresAt).toLocaleString() : 'No expiry set'}</dd></div>
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
                      <strong>Revoke only this grant?</strong>
                      <p>Future requests using this credential will stop. Already imported material and completed work stay. Data already retrieved cannot be recalled.</p>
                      <div className="connections-actions">
                        <button
                          type="button"
                          className="ui-button ui-button-primary"
                          onClick={() => {
                            tokenModel.handleRevokeToken(view.id);
                            setRevokeGrantId('');
                          }}
                        >
                          Confirm revoke
                        </button>
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
        <summary>Manual setup, expiry, and token controls</summary>
        <p>
          Use this fallback only when the browser handoff is unavailable. A manually issued secret is shown once.
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
            Agent write
          </label>
        </div>
        <button
          type="button"
          className="ui-button ui-button-secondary"
          disabled={tokenModel.creatingToken}
          onClick={tokenModel.handleCreateToken}
        >
          {tokenModel.creatingToken ? 'Issuing…' : 'Issue manual token'}
        </button>
        {tokenModel.issuedSecret ? (
          <div className="connections-secret">
            <strong>New secret — shown once</strong>
            <pre>{tokenModel.issuedSecret}</pre>
            <button
              type="button"
              className="connections-text-button"
              onClick={() => copy(tokenModel.issuedSecret, 'Secret copied. Store it in the intended credential manager.')}
            >
              Copy secret
            </button>
          </div>
        ) : null}
      </details>

      <div className="connections-footer-links">
        {onOpenTaskLink ? (
          <button type="button" className="connections-text-button" onClick={onOpenTaskLink}>
            Create a separate agent task link →
          </button>
        ) : null}
        <a href="/.well-known/noeis-agent.json">Machine-readable connection contract →</a>
      </div>
    </div>
  );
}
