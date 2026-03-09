import React from 'react';
import { Button, Card } from '../ui';

const AgentQuickStartCard = ({
  agentModel,
  showAdvanced = false,
  onToggleAdvanced = () => {}
}) => {
  const {
    sortedAgents,
    agentsLoading,
    agentsError,
    agentName,
    setAgentName,
    creatingAgent,
    newAgentKey,
    handleCreateAgent
  } = agentModel;

  const activeAgents = sortedAgents.filter(agent => agent.status === 'active');
  const hasAgents = sortedAgents.length > 0;

  return (
    <Card className="settings-card">
      <h2 id="personal-agents">Set up your personal agent</h2>
      <p className="muted">
        Give your agent a name and start using it in Think handoffs. You can configure advanced BYO bridge options after setup.
      </p>

      <div className="settings-import-row">
        <div style={{ flex: 1 }}>
          <p className="muted-label">{hasAgents ? 'Add another agent' : 'Agent name'}</p>
          <input
            type="text"
            value={agentName}
            onChange={(event) => setAgentName(event.target.value)}
            placeholder="Jarvis"
            disabled={creatingAgent}
          />
        </div>
        <Button variant="secondary" disabled={creatingAgent || !String(agentName || '').trim()} onClick={handleCreateAgent}>
          {creatingAgent ? 'Creating…' : 'Create agent'}
        </Button>
      </div>

      {agentsLoading ? (
        <p className="muted small">Loading agents…</p>
      ) : (
        <p className="muted small">
          {activeAgents.length > 0
            ? `Active personal agents: ${activeAgents.map(agent => agent.name).join(', ')}`
            : 'No active personal agents yet.'}
        </p>
      )}

      {newAgentKey && (
        <div className="import-summary">
          <p className="muted-label">New API key (shown once)</p>
          <p style={{ wordBreak: 'break-all' }}>{newAgentKey}</p>
        </div>
      )}

      <div className="settings-import-row" style={{ marginTop: 8 }}>
        <Button variant="secondary" onClick={onToggleAdvanced}>
          {showAdvanced ? 'Hide advanced agent settings' : 'Show advanced agent settings'}
        </Button>
      </div>
      <p className="muted small">
        Advanced includes bridge setup for external runtimes (OpenClaw, custom MCP/A2A workers), policy tuning, and key rotation.
      </p>

      {agentsError && <p className="status-message error-message">{agentsError}</p>}
    </Card>
  );
};

export default AgentQuickStartCard;
