import React, { useCallback, useState } from 'react';
import { Button, Card } from '../ui';

const resolveTokenId = (token = {}) => token.id || token._id || token.tokenId || '';

const formatTokenDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString();
};

const formatActionLabel = (value) => String(value || 'wiki action').replace(/_/g, ' ');

const ConnectedAgentsCard = ({ tokenModel }) => {
  const [copyStatus, setCopyStatus] = useState('');
  const {
    sortedTokens,
    tokensLoading,
    tokensError,
    tokenLabel,
    setTokenLabel,
    tokenScopes,
    handleScopeChange,
    tokenDailyQuota,
    setTokenDailyQuota,
    tokenExpiresAt,
    setTokenExpiresAt,
    creatingToken,
    tokenBusyId,
    issuedToken,
    issuedSecret,
    expandedTokenId,
    tokenActionsById,
    tokenActionsLoadingId,
    tokenActionUndoId,
    tokenActionsError,
    handleCreateToken,
    handleRevokeToken,
    handleDeleteToken,
    handleToggleTokenActivity,
    handleUndoTokenAction
  } = tokenModel;

  const handleCopySecret = useCallback(async () => {
    if (!issuedSecret) return;
    try {
      await navigator.clipboard.writeText(issuedSecret);
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus(''), 2200);
    } catch (_error) {
      setCopyStatus('error');
      window.setTimeout(() => setCopyStatus(''), 3200);
    }
  }, [issuedSecret]);

  return (
    <Card className="settings-card connected-agents-card">
      <div className="settings-appearance-header">
        <div>
          <h2>Connected agents</h2>
          <p className="muted">Issue and manage workspace tokens for external agents.</p>
        </div>
        <p className="muted-label">{tokensLoading ? 'Loading' : `${sortedTokens.length} tokens`}</p>
      </div>

      <div className="settings-import-row" style={{ alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="settings-import-field">
          <p className="muted-label">Token label</p>
          <input
            type="text"
            value={tokenLabel}
            onChange={(event) => setTokenLabel(event.target.value)}
            placeholder="Research worker"
            disabled={creatingToken}
            aria-label="Agent token label"
            style={{
              width: '100%',
              border: '1px solid var(--border-color-light)',
              borderRadius: 10,
              background: 'var(--surface-elevated)',
              color: 'var(--text-color)',
              padding: '10px 12px',
              font: 'inherit'
            }}
          />
        </div>
        <div className="settings-import-field">
          <p className="muted-label">Daily quota</p>
          <input
            type="number"
            min="0"
            value={tokenDailyQuota}
            onChange={(event) => setTokenDailyQuota(event.target.value)}
            placeholder="Optional"
            disabled={creatingToken}
            aria-label="Agent token daily quota"
            style={{
              width: '100%',
              border: '1px solid var(--border-color-light)',
              borderRadius: 10,
              background: 'var(--surface-elevated)',
              color: 'var(--text-color)',
              padding: '10px 12px',
              font: 'inherit'
            }}
          />
        </div>
        <div className="settings-import-field">
          <p className="muted-label">Expiry</p>
          <input
            type="date"
            value={tokenExpiresAt}
            onChange={(event) => setTokenExpiresAt(event.target.value)}
            disabled={creatingToken}
            aria-label="Agent token expiry"
            style={{
              width: '100%',
              border: '1px solid var(--border-color-light)',
              borderRadius: 10,
              background: 'var(--surface-elevated)',
              color: 'var(--text-color)',
              padding: '10px 12px',
              font: 'inherit'
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleCreateToken}
          disabled={creatingToken}
        >
          {creatingToken ? 'Issuing…' : 'Issue token'}
        </Button>
      </div>
      <div className="settings-option-row" style={{ marginBottom: 16 }}>
        {[
          ['read', 'Read'],
          ['agent-write', 'Agent write']
        ].map(([scope, label]) => (
          <label key={scope} className="settings-option-button" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={(tokenScopes || []).includes(scope)}
              onChange={(event) => handleScopeChange(scope, event.target.checked)}
              disabled={creatingToken}
              style={{ marginRight: 8 }}
            />
            {label}
          </label>
        ))}
      </div>

      {issuedSecret && (
        <div
          className="import-summary"
          role="region"
          aria-label="New agent token secret"
          style={{
            padding: '14px 16px',
            borderRadius: 14,
            border: '1px solid color-mix(in srgb, var(--primary-color, #0b74ff) 28%, var(--border-color-light))',
            background: 'color-mix(in srgb, var(--surface-elevated) 92%, var(--primary-color, #0b74ff) 6%)',
            marginBottom: 16
          }}
        >
          <div className="external-bridge-token-well__header">
            <p className="muted-label external-bridge-token-well__label">New token secret (shown once)</p>
            <Button type="button" variant="secondary" onClick={handleCopySecret}>
              {copyStatus === 'copied' ? 'Copied' : 'Copy secret'}
            </Button>
          </div>
          <p className="muted small">
            Store this secret now. It will not be shown again.
          </p>
          <pre className="external-bridge-pre external-bridge-token-well__value">{issuedSecret}</pre>
          {issuedToken?.label && <p className="muted small">Issued for {issuedToken.label}</p>}
          {copyStatus === 'error' && (
            <p className="status-message error-message">Clipboard unavailable. Select the secret and copy manually.</p>
          )}
        </div>
      )}

      {tokensLoading ? (
        <p className="muted">Loading connected agents…</p>
      ) : sortedTokens.length === 0 ? (
        <p className="muted">No connected agent tokens yet.</p>
      ) : (
        <div className="import-summary">
          <p className="muted-label">Issued tokens</p>
          {sortedTokens.map((token) => {
            const tokenId = resolveTokenId(token);
            const status = token.revokedAt ? 'revoked' : token.status || 'active';
            const isExpanded = expandedTokenId === tokenId;
            const tokenActivity = tokenActionsById?.[tokenId] || { actions: [], counts: { today: 0, week: 0 } };
            const actions = Array.isArray(tokenActivity.actions) ? tokenActivity.actions : [];
            const counts = tokenActivity.counts || { today: 0, week: 0 };
            return (
              <div key={tokenId || token.label}>
                <div
                  className="settings-import-row connected-agents-token-row"
                  style={{
                    alignItems: 'flex-start',
                    padding: '14px 0'
                  }}
                >
                  <div>
                    <p>
                      <strong>{token.label || 'Agent token'}</strong>
                      <span className="muted"> · {status}</span>
                    </p>
                    <p className="muted small">
                      Prefix: {token.prefix || token.tokenPrefix || token.secretPrefix || '(hidden)'}
                    </p>
                    <p className="muted small">
                      Scopes: {(token.scopes || []).join(', ') || 'read'}
                      {' · '}
                      Quota: {Number(token.callsToday || 0)} / {token.dailyQuota || 'unlimited'} today
                      {token.expiresAt ? ` · Expires ${formatTokenDate(token.expiresAt)}` : ''}
                    </p>
                    <p className="muted small">
                      Created {formatTokenDate(token.createdAt) || 'unknown'}
                      {token.lastUsedAt ? ` · Last used ${formatTokenDate(token.lastUsedAt)}` : ''}
                      {token.revokedAt ? ` · Revoked ${formatTokenDate(token.revokedAt)}` : ''}
                    </p>
                  </div>
                  <div
                    className="settings-import-row"
                    style={{
                      borderBottom: 'none',
                      padding: 0,
                      justifyContent: 'flex-end'
                    }}
                  >
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!tokenId}
                      onClick={() => handleToggleTokenActivity(tokenId)}
                    >
                      {isExpanded ? 'Hide activity' : 'Activity'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={Boolean(tokenBusyId) || status === 'revoked'}
                      onClick={() => handleRevokeToken(tokenId)}
                    >
                      {tokenBusyId === tokenId ? 'Working…' : 'Revoke'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={Boolean(tokenBusyId)}
                      onClick={() => handleDeleteToken(tokenId)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div
                    className="import-summary"
                    style={{ margin: '0 0 10px 0', padding: '12px 14px' }}
                  >
                    <p className="muted-label">Activity · last 30 days</p>
                    <p className="muted small">
                      {Number(counts.today || 0)} today · {Number(counts.week || 0)} this week
                    </p>
                    {tokenActionsLoadingId === tokenId ? (
                      <p className="muted small">Loading activity…</p>
                    ) : actions.length === 0 ? (
                      <p className="muted small">No recorded agent activity yet.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                        {actions.slice(0, 8).map((action) => (
                          <div key={action.id || `${action.action}-${action.createdAt}`} className="external-bridge-source-row">
                            <div>
                              <p>
                                <strong>{formatActionLabel(action.action)}</strong>
                                <span className="muted"> · {action.status || 'unknown'}</span>
                              </p>
                              <p className="muted small">
                                {action.method || 'GET'} {action.route || action.targetType || 'wiki'}
                                {action.durationMs !== null && action.durationMs !== undefined ? ` · ${action.durationMs}ms` : ''}
                              </p>
                              {action.targetHref ? (
                                <a className="muted small" href={action.targetHref}>
                                  Open target
                                </a>
                              ) : null}
                            </div>
                            {action.canUndo ? (
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={Boolean(tokenActionUndoId)}
                                onClick={() => handleUndoTokenAction(tokenId, action)}
                                title="Undo this reversible wiki action."
                              >
                                {tokenActionUndoId === (action.id || action.undoPath) ? 'Undoing…' : 'Undo'}
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                    {tokenActionsError && <p className="status-message error-message">{tokenActionsError}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tokensError && <p className="status-message error-message">{tokensError}</p>}
    </Card>
  );
};

export default ConnectedAgentsCard;
