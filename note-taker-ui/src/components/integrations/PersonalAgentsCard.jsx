import React from 'react';
import { Button, Card } from '../ui';

const PersonalAgentsCard = ({
  agentModel,
  entitlementsModel,
  formatDate = () => ''
}) => {
  const {
    sortedAgents,
    agentsLoading,
    agentsError,
    agentBusyId,
    newAgentKey,
    handleRotateKey,
    handleDisableAgent
  } = agentModel;
  const {
    entitlements,
    entitlementsLoading,
    entitlementsSaving,
    entitlementsError,
    handleSetEntitlementsDev
  } = entitlementsModel;

  return (
    <Card className="settings-card">
      <h2>Advanced agent management</h2>
      <p className="muted">
        Manage keys and usage for personal agents you created in this workspace.
      </p>

      {newAgentKey && (
        <div className="import-summary">
          <p className="muted-label">New API key (shown once)</p>
          <p style={{ wordBreak: 'break-all' }}>{newAgentKey}</p>
        </div>
      )}

      <div className="import-summary">
        <p className="muted-label">Personal agent API (BYO-compatible, private workspace only)</p>
        <p className="muted small">
          Authenticate with <code>x-agent-id</code> and <code>x-agent-key</code> headers.
        </p>
        <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>
{`GET  /api/agent/byo/session
POST /api/agent/byo/chat
POST /api/agent/byo/actions/execute
GET  /api/agent/byo/protocol/handoffs
POST /api/agent/byo/protocol/handoffs
POST /api/agent/byo/protocol/handoffs/:handoffId/claim
POST /api/agent/byo/protocol/handoffs/:handoffId/complete
POST /api/agent/byo/protocol/handoffs/:handoffId/reject`}
        </pre>
      </div>

      <div className="import-summary">
        <p className="muted-label">Research entitlement</p>
        {entitlementsLoading ? (
          <p className="muted small">Loading entitlement status…</p>
        ) : (
          <>
            <p>Tier: {entitlements.premiumTier || 'free'}</p>
            <p>Web research enabled: {entitlements.webResearchEnabled ? 'Yes' : 'No'}</p>
            <p>Available now: {entitlements.premiumWebResearchAvailable ? 'Yes' : 'No'}</p>
          </>
        )}
        <div className="settings-import-row" style={{ marginTop: 8 }}>
          <Button
            variant="secondary"
            disabled={entitlementsSaving}
            onClick={() => handleSetEntitlementsDev({
              premiumTier: 'premium',
              webResearchEnabled: true,
              webResearchBetaEnabled: true
            })}
          >
            {entitlementsSaving ? 'Saving…' : 'Enable premium research (dev)'}
          </Button>
          <Button
            variant="secondary"
            disabled={entitlementsSaving}
            onClick={() => handleSetEntitlementsDev({
              premiumTier: 'free',
              webResearchEnabled: false,
              webResearchBetaEnabled: false
            })}
          >
            Set free tier (dev)
          </Button>
        </div>
        <p className="muted small">
          Dev controls are blocked in production and will be replaced by billing/webhook provisioning.
        </p>
        {entitlementsError && <p className="status-message error-message">{entitlementsError}</p>}
      </div>

      {agentsLoading ? (
        <p className="muted">Loading personal agents…</p>
      ) : sortedAgents.length === 0 ? (
        <p className="muted">No personal agents yet.</p>
      ) : (
        <div className="import-summary">
          <p className="muted-label">Your agents</p>
          {sortedAgents.map((agent) => (
            <div key={agent._id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
              <p><strong>{agent.name}</strong> · {agent.status}</p>
              {agent.description && <p className="muted">{agent.description}</p>}
              <p>Key prefix: {agent.apiKeyPrefix || '(hidden)'}</p>
              {agent.lastUsedAt && <p>Last used: {formatDate(agent.lastUsedAt)}</p>}
              <div className="settings-import-row" style={{ marginTop: 8 }}>
                <Button
                  variant="secondary"
                  disabled={Boolean(agentBusyId)}
                  onClick={() => handleRotateKey(agent._id)}
                >
                  {agentBusyId === agent._id ? 'Working…' : 'Rotate key'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={Boolean(agentBusyId) || agent.status === 'disabled'}
                  onClick={() => handleDisableAgent(agent._id)}
                >
                  Disable
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {agentsError && <p className="status-message error-message">{agentsError}</p>}
    </Card>
  );
};

export default PersonalAgentsCard;
