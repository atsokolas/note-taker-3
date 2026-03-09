import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '../ui';

const ExternalBridgeCard = ({
  bridgeModel,
  sortedAgents = []
}) => {
  const activePersonalAgents = sortedAgents.filter(agent => agent.status === 'active');

  const {
    bridgeActorType,
    setBridgeActorType,
    bridgeActorId,
    setBridgeActorId,
    bridgeScope,
    setBridgeScope,
    bridgeTtl,
    setBridgeTtl,
    bridgeBusy,
    bridgeError,
    bridgeToken,
    handleCreateBridgeToken
  } = bridgeModel;

  return (
    <Card className="settings-card">
      <h2>External BYO bridge (A2A + MCP adapter)</h2>
      <p className="muted">
        Connect external runtimes (OpenClaw, custom agents, MCP/A2A workers). Personal agents you create here appear as selectable BYO actors.
      </p>
      <div className="settings-import-row">
        <div style={{ flex: 1 }}>
          <p className="muted-label">Actor type</p>
          <select value={bridgeActorType} onChange={(event) => setBridgeActorType(event.target.value)} disabled={bridgeBusy}>
            <option value="user">User</option>
            <option value="native_agent">Native agent</option>
            <option value="byo_agent">Personal agent (BYO)</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <p className="muted-label">Personal agent (if selected)</p>
          <select
            value={bridgeActorId}
            onChange={(event) => setBridgeActorId(event.target.value)}
            disabled={bridgeBusy || bridgeActorType !== 'byo_agent'}
          >
            <option value="">Select personal agent</option>
            {activePersonalAgents.map(agent => (
              <option key={agent._id} value={agent._id}>{agent.name}</option>
            ))}
          </select>
          {bridgeActorType === 'byo_agent' && activePersonalAgents.length === 0 && (
            <p className="muted small">
              No active personal agents yet. <Link to="/integrations#personal-agents">Set up an agent</Link>.
            </p>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <p className="muted-label">TTL seconds</p>
          <input
            type="number"
            min={60}
            max={7200}
            value={bridgeTtl}
            onChange={(event) => setBridgeTtl(event.target.value)}
            disabled={bridgeBusy}
          />
        </div>
        <Button variant="secondary" disabled={bridgeBusy} onClick={handleCreateBridgeToken}>
          {bridgeBusy ? 'Minting…' : 'Mint bridge token'}
        </Button>
      </div>
      <div className="settings-import-row">
        <div style={{ flex: 1 }}>
          <p className="muted-label">Scope</p>
          <input
            type="text"
            value={bridgeScope}
            onChange={(event) => setBridgeScope(event.target.value)}
            disabled={bridgeBusy}
            placeholder="handoff_ops"
          />
        </div>
      </div>
      {bridgeError && <p className="status-message error-message">{bridgeError}</p>}
      {bridgeToken && (
        <div className="import-summary">
          <p className="muted-label">Bridge token (shown once)</p>
          <p style={{ wordBreak: 'break-all' }}>{bridgeToken}</p>
          <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>
{`Bridge endpoints:
GET  /api/agent/protocol/bridge/manifest
POST /api/agent/protocol/bridge/a2a
POST /api/agent/protocol/bridge/mcp`}
          </pre>
        </div>
      )}
    </Card>
  );
};

export default ExternalBridgeCard;
