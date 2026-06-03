import React, { useEffect, useState } from 'react';
import { Button, Card } from '../ui';
import { AGENT_WORKER_ROLE_OPTIONS } from '../../constants/agentWorkerRoles';

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
    handleUpdateAgent,
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
  const [roleDrafts, setRoleDrafts] = useState({});

  useEffect(() => {
    setRoleDrafts((previous) => {
      const next = {};
      sortedAgents.forEach((agent) => {
        const current = Array.isArray(agent?.preferredWorkerRoles) ? agent.preferredWorkerRoles : [];
        next[agent._id] = Array.isArray(previous[agent._id]) ? previous[agent._id] : current;
      });
      return next;
    });
  }, [sortedAgents]);

  return (
    <Card className="settings-card">
      <h2>Advanced agent management</h2>
      <p className="muted">
        Manage keys and usage for specialist agents you created in this workspace.
      </p>

      {newAgentKey && (
        <div className="import-summary">
          <p className="muted-label">New API key (shown once)</p>
          <p style={{ wordBreak: 'break-all' }}>{newAgentKey}</p>
        </div>
      )}

      <div className="import-summary">
        <p className="muted-label">Specialist agent API (BYO-compatible, private workspace only)</p>
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
        <p className="muted">Loading specialist agents…</p>
      ) : sortedAgents.length === 0 ? (
        <p className="muted">No specialist agents yet.</p>
      ) : (
        <div className="import-summary">
          <p className="muted-label">Your agents</p>
          {sortedAgents.map((agent) => (
            <div key={agent._id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
              <p><strong>{agent.name}</strong> · {agent.status}</p>
              {agent.description && <p className="muted">{agent.description}</p>}
              <p className="muted small">
                Specialist roles: {(Array.isArray(agent.preferredWorkerRoles) && agent.preferredWorkerRoles.length > 0)
                  ? agent.preferredWorkerRoles.join(', ')
                  : 'None declared'}
              </p>
              <p>Key prefix: {agent.apiKeyPrefix || '(hidden)'}</p>
              {agent.lastUsedAt && <p>Last used: {formatDate(agent.lastUsedAt)}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {AGENT_WORKER_ROLE_OPTIONS.map((option) => {
                  const selected = Array.isArray(roleDrafts[agent._id]) && roleDrafts[agent._id].includes(option.role);
                  return (
                    <label key={`${agent._id}-${option.role}`} className="muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={Boolean(agentBusyId)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setRoleDrafts((previous) => {
                            const current = Array.isArray(previous[agent._id]) ? previous[agent._id] : [];
                            const nextRoles = checked
                              ? Array.from(new Set([...current, option.role]))
                              : current.filter((role) => role !== option.role);
                            return {
                              ...previous,
                              [agent._id]: nextRoles
                            };
                          });
                        }}
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
              <div className="settings-import-row" style={{ marginTop: 8 }}>
                <Button
                  variant="secondary"
                  disabled={Boolean(agentBusyId)}
                  onClick={() => handleUpdateAgent(agent._id, {
                    preferredWorkerRoles: Array.isArray(roleDrafts[agent._id]) ? roleDrafts[agent._id] : []
                  })}
                >
                  {agentBusyId === agent._id ? 'Working…' : 'Save specialties'}
                </Button>
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
