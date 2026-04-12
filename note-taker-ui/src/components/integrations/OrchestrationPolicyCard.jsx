import React from 'react';
import { Button, Card } from '../ui';

const HOOK_EFFECT_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'observe', label: 'Observe' },
  { value: 'warn', label: 'Warn' },
  { value: 'require_approval', label: 'Require approval' }
];

const OrchestrationPolicyCard = ({
  policyModel,
  sortedAgents = []
}) => {
  const {
    protocolPolicy,
    setProtocolPolicy,
    policyLoading,
    policySaving,
    policyError,
    handleSaveProtocolPolicy
  } = policyModel;

  return (
    <Card className="settings-card">
      <h2>Agent orchestration policy</h2>
      <p className="muted">Set default routing so new auto-planned handoffs are assigned to native or personal agents.</p>
      {policyLoading ? (
        <p className="muted small">Loading policy…</p>
      ) : (
        <>
          <div className="settings-import-row">
            <div style={{ flex: 1 }}>
              <p className="muted-label">Routing mode</p>
              <select
                value={protocolPolicy.routingMode}
                onChange={(event) => setProtocolPolicy((previous) => ({ ...previous, routingMode: event.target.value }))}
              >
                <option value="balanced">Balanced</option>
                <option value="native_first">Native first</option>
                <option value="byo_first">Personal first</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <p className="muted-label">Default personal agent</p>
              <select
                value={protocolPolicy.defaultByoAgentId}
                onChange={(event) => setProtocolPolicy((previous) => ({ ...previous, defaultByoAgentId: event.target.value }))}
              >
                <option value="">None</option>
                {sortedAgents
                  .filter(agent => agent.status === 'active')
                  .map(agent => (
                    <option key={agent._id} value={agent._id}>{agent.name}</option>
                  ))}
              </select>
            </div>
          </div>
          <div className="settings-import-row" style={{ marginTop: 8 }}>
            <label className="muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={Boolean(protocolPolicy.allowByoForResearch)}
                onChange={(event) => setProtocolPolicy((previous) => ({ ...previous, allowByoForResearch: event.target.checked }))}
              />
              Allow personal agents for research tasks
            </label>
            <label className="muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={Boolean(protocolPolicy.allowByoForSynthesis)}
                onChange={(event) => setProtocolPolicy((previous) => ({ ...previous, allowByoForSynthesis: event.target.checked }))}
              />
              Allow personal agents for synthesis tasks
            </label>
            <label className="muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={Boolean(protocolPolicy.preferByoSpecialists)}
                onChange={(event) => setProtocolPolicy((previous) => ({ ...previous, preferByoSpecialists: event.target.checked }))}
              />
              Prefer specialist-matched personal agents
            </label>
            <Button variant="secondary" disabled={policySaving} onClick={handleSaveProtocolPolicy}>
              {policySaving ? 'Saving…' : 'Save policy'}
            </Button>
          </div>
          <div className="settings-import-row" style={{ marginTop: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <p className="muted-label">Hook phases</p>
              <p className="muted small">Built-in before/after protocol hooks record durable activity without adding a separate scripting system.</p>
            </div>
          </div>
          <div className="settings-import-row" style={{ marginTop: 4, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 180 }}>
              <p className="muted-label">Before thread ops</p>
              <select
                value={String(protocolPolicy?.hooks?.beforeThreadOps || 'off')}
                onChange={(event) => setProtocolPolicy((previous) => ({
                  ...previous,
                  hooks: { ...(previous.hooks || {}), beforeThreadOps: event.target.value }
                }))}
              >
                {HOOK_EFFECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 180 }}>
              <p className="muted-label">After thread ops</p>
              <select
                value={String(protocolPolicy?.hooks?.afterThreadOps || 'off')}
                onChange={(event) => setProtocolPolicy((previous) => ({
                  ...previous,
                  hooks: { ...(previous.hooks || {}), afterThreadOps: event.target.value }
                }))}
              >
                {HOOK_EFFECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 180 }}>
              <p className="muted-label">Before handoff ops</p>
              <select
                value={String(protocolPolicy?.hooks?.beforeHandoffOps || 'observe')}
                onChange={(event) => setProtocolPolicy((previous) => ({
                  ...previous,
                  hooks: { ...(previous.hooks || {}), beforeHandoffOps: event.target.value }
                }))}
              >
                {HOOK_EFFECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 180 }}>
              <p className="muted-label">After handoff ops</p>
              <select
                value={String(protocolPolicy?.hooks?.afterHandoffOps || 'observe')}
                onChange={(event) => setProtocolPolicy((previous) => ({
                  ...previous,
                  hooks: { ...(previous.hooks || {}), afterHandoffOps: event.target.value }
                }))}
              >
                {HOOK_EFFECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
      {policyError && <p className="status-message error-message">{policyError}</p>}
    </Card>
  );
};

export default OrchestrationPolicyCard;
