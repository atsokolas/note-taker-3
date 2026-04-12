import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '../ui';

const buildAuthHeaderSnippet = (bridgeToken = '') => (
  bridgeToken ? `Authorization: Bearer ${bridgeToken}` : 'Authorization: Bearer <BRIDGE_TOKEN>'
);

const buildA2aExample = (bridgeToken = '') => `curl -X POST http://localhost:5500/api/agent/protocol/bridge/a2a \\
  -H "Content-Type: application/json" \\
  -H "${buildAuthHeaderSnippet(bridgeToken)}" \\
  -d '{
    "op": "handoffs.claim",
    "payload": {
      "handoffId": "HANDOFF_ID",
      "note": "Claimed by a BYO researcher worker after the native planner routed this task."
    }
  }'`;

const buildMcpExample = () => `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "artifacts/drafts/promote",
  "params": {
    "draftId": "DRAFT_ID"
  }
}`;

const buildWorkflowExample = () => `Recommended specialist-worker loop
1. bridge/manifest
2. bridge/worker-roles
3. handoffs/list
4. handoffs/claim
5. handoffs/ensure_thread
6. threads/append_message or artifacts/drafts/create
7. artifacts/drafts/promote
8. handoffs/complete`;

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
    protocolApprovals,
    protocolApprovalsLoading,
    protocolApprovalsError,
    protocolApprovalBusyId,
    handleCreateBridgeToken,
    handleApproveProtocolApproval,
    handleRejectProtocolApproval
  } = bridgeModel;

  return (
    <Card className="settings-card">
      <h2>External BYO bridge (A2A + MCP adapter)</h2>
      <p className="muted">
        Connect external runtimes (OpenClaw, custom agents, MCP/A2A workers). Bridge actors now plug into the native orchestrator as specialist workers that read shared threads, continue handoffs, and stage artifact drafts without becoming a second control plane.
      </p>
      <p className="muted small">
        Use `agent_ops` for the full shared workflow: role-aware handoff routing, thread continuation, artifact draft staging, conversion into handoffs, and reopening handoffs back into threads.
      </p>
      {activePersonalAgents.length > 0 && (
        <div className="import-summary" style={{ marginBottom: 14 }}>
          <p className="muted-label">Active specialist workers</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {activePersonalAgents.map((agent) => (
              <div key={agent._id} className="settings-import-row">
                <strong>{agent.name}</strong>
                <span className="muted small">
                  {(Array.isArray(agent.preferredWorkerRoles) && agent.preferredWorkerRoles.length > 0)
                    ? agent.preferredWorkerRoles.join(', ')
                    : 'No specialist roles declared'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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
            placeholder="agent_ops"
          />
        </div>
      </div>
      {bridgeError && <p className="status-message error-message">{bridgeError}</p>}
      {protocolApprovalsError && <p className="status-message error-message">{protocolApprovalsError}</p>}
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
          <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            <div>
              <p className="muted-label">A2A example: claim routed work as a specialist worker</p>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{buildA2aExample(bridgeToken)}</pre>
            </div>
            <div>
              <p className="muted-label">MCP example: promote a draft</p>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{buildMcpExample()}</pre>
            </div>
            <div>
              <p className="muted-label">Shared workflow</p>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{buildWorkflowExample()}</pre>
            </div>
            <div>
              <p className="muted-label">Bridge methods</p>
              <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>
{`threads/list
threads/get
threads/create
threads/update
threads/append_message
threads/convert_to_handoff
artifacts/drafts/list
artifacts/drafts/create
artifacts/drafts/promote
artifacts/drafts/dismiss
handoffs/list
handoffs/create
handoffs/ensure_thread
handoffs/claim
handoffs/complete
handoffs/reject`}
              </pre>
            </div>
          </div>
        </div>
      )}
      <div className="import-summary" style={{ marginTop: 18 }}>
        <p className="muted-label">Pending protocol approvals</p>
        <p className="muted small">
          Bridge-issued writes from non-user specialist workers pause here before they can mutate shared threads or handoffs.
        </p>
        {protocolApprovalsLoading ? (
          <p className="muted small">Loading protocol approvals…</p>
        ) : protocolApprovals.length === 0 ? (
          <p className="muted small">No pending protocol approvals.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {protocolApprovals.map((approval) => {
              const approvalId = String(approval?.approvalId || '');
              const busy = protocolApprovalBusyId === approvalId;
              return (
                <div key={approvalId} style={{ borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.1))', paddingTop: 12 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{approval.op || 'Protocol action'}</p>
                  {approval.reason && <p className="muted small" style={{ margin: '4px 0 0' }}>{approval.reason}</p>}
                  <div className="settings-import-row" style={{ marginTop: 8 }}>
                    {approval.preview?.title && <span className="muted small">{approval.preview.title}</span>}
                    {approval.preview?.threadId && <span className="muted small">thread {approval.preview.threadId}</span>}
                    {approval.preview?.handoffId && <span className="muted small">handoff {approval.preview.handoffId}</span>}
                    <span className="muted small">{approval.requestedBy?.actorType || 'agent'}</span>
                  </div>
                  <div className="settings-import-row" style={{ marginTop: 8 }}>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => handleApproveProtocolApproval(approvalId)}
                    >
                      {busy ? 'Applying…' : 'Approve'}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => handleRejectProtocolApproval(approvalId)}
                    >
                      {busy ? 'Working…' : 'Reject'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};

export default ExternalBridgeCard;
