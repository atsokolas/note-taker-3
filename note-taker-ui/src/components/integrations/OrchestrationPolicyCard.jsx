import React from 'react';
import { Button, Card } from '../ui';

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
      <p className="muted">Set default routing so new auto-planned handoffs are assigned to native or BYO agents.</p>
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
                <option value="byo_first">BYO first</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <p className="muted-label">Default BYO agent</p>
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
              Allow BYO for research tasks
            </label>
            <label className="muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={Boolean(protocolPolicy.allowByoForSynthesis)}
                onChange={(event) => setProtocolPolicy((previous) => ({ ...previous, allowByoForSynthesis: event.target.checked }))}
              />
              Allow BYO for synthesis tasks
            </label>
            <Button variant="secondary" disabled={policySaving} onClick={handleSaveProtocolPolicy}>
              {policySaving ? 'Saving…' : 'Save policy'}
            </Button>
          </div>
        </>
      )}
      {policyError && <p className="status-message error-message">{policyError}</p>}
    </Card>
  );
};

export default OrchestrationPolicyCard;
