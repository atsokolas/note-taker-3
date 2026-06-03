import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, SegmentedNav } from '../ui';
import { AGENT_DISPLAY_NAME, SPECIALIST_AGENT_LABEL, USER_BRIDGE_LABEL } from '../../constants/agentIdentity';

const CAPABILITY_LABELS = {
  sharedSkills: 'Shared skills',
  sharedThreads: 'Shared threads',
  sharedArtifactDrafts: 'Shared artifact drafts',
  protocolHandoffs: 'Protocol handoffs',
  supportsPlans: 'Plans',
  supportsCheckpoints: 'Checkpoints',
  supportsThreadHandoffConversion: 'Thread to handoff conversion',
  supportsWorkerRoles: 'Worker roles',
  supportsSpecialistWorkers: 'Specialist workers'
};

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

const resolveBridgeBaseUrl = () => {
  const configured = String(process.env.REACT_APP_API_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/$/, '');
  }
  return 'http://localhost:5500';
};

const buildOpenClawConfig = ({
  bridgeToken = '',
  scope = 'agent_ops',
  actorType = 'user',
  actorName = '',
  expiresInSec = 1800
}) => {
  const baseUrl = resolveBridgeBaseUrl();
  return JSON.stringify({
    name: actorName || (actorType === 'native_agent' ? AGENT_DISPLAY_NAME : actorType === 'byo_agent' ? SPECIALIST_AGENT_LABEL : USER_BRIDGE_LABEL),
    protocol: 'note-taker-agent-bridge-v1',
    scope,
    expires_in_sec: expiresInSec,
    manifest_url: `${baseUrl}/api/agent/protocol/bridge/manifest`,
    a2a_url: `${baseUrl}/api/agent/protocol/bridge/a2a`,
    mcp_url: `${baseUrl}/api/agent/protocol/bridge/mcp`,
    headers: {
      Authorization: `Bearer ${bridgeToken}`
    }
  }, null, 2);
};

const listEnabledCapabilities = (capabilities = {}) => Object.entries(capabilities)
  .filter(([, enabled]) => Boolean(enabled))
  .map(([key]) => CAPABILITY_LABELS[key] || key);

const BRIDGE_METHODS_LIST = `threads/list
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
handoffs/reject`;

const ExternalBridgeCard = ({
  bridgeModel,
  sortedAgents = []
}) => {
  const [postMintTab, setPostMintTab] = useState('config');
  const [tokenCopyStatus, setTokenCopyStatus] = useState('');

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
    bridgeManifestLoading,
    bridgeManifestError,
    bridgeManifest,
    bridgeCopyStatus,
    bridgeMeta,
    protocolApprovals,
    protocolApprovalsLoading,
    protocolApprovalsError,
    protocolApprovalBusyId,
    handleCreateBridgeToken,
    handleTestBridgeConnection,
    handleCopyBridgeConfig,
    handleApproveProtocolApproval,
    handleRejectProtocolApproval
  } = bridgeModel;

  const selectedAgent = activePersonalAgents.find(agent => agent._id === bridgeActorId);
  const selectedAgentName = selectedAgent?.name || '';
  const manifestCapabilities = listEnabledCapabilities(bridgeManifest?.capabilities);
  const bridgeConfigPreview = bridgeToken ? buildOpenClawConfig({
    bridgeToken,
    scope: bridgeMeta?.scope || bridgeScope,
    actorType: bridgeActorType,
    actorName: selectedAgentName,
    expiresInSec: bridgeMeta?.expiresInSec || bridgeTtl
  }) : '';

  const handleCopyToken = useCallback(async () => {
    if (!bridgeToken) return;
    try {
      await navigator.clipboard.writeText(bridgeToken);
      setTokenCopyStatus('copied');
      window.setTimeout(() => setTokenCopyStatus(''), 2200);
    } catch (_err) {
      setTokenCopyStatus('error');
      window.setTimeout(() => setTokenCopyStatus(''), 3200);
    }
  }, [bridgeToken]);

  return (
    <Card className="settings-card external-bridge-card">
      <h2>External BYO bridge (A2A + MCP adapter)</h2>
      <p className="muted">
        Connect external runtimes (OpenClaw, custom agents, MCP/A2A workers). Bridge actors now plug into the native orchestrator as specialist workers that read shared threads, continue handoffs, and stage artifact drafts without becoming a second control plane.
      </p>
      <p className="muted small">
        Use `agent_ops` for the full shared workflow: role-aware handoff routing, thread continuation, artifact draft staging, conversion into handoffs, and reopening handoffs back into threads.
      </p>
      {activePersonalAgents.length > 0 && (
        <div className="import-summary external-bridge-agent-block">
          <p className="muted-label">Active specialist workers</p>
          <div className="external-bridge-agent-grid">
            {activePersonalAgents.map((agent) => (
              <div key={agent._id} className="settings-import-row external-bridge-agent-row">
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
      <div className="settings-import-row external-bridge-mint-row">
        <div className="settings-import-field">
          <p className="muted-label">Actor type</p>
          <select value={bridgeActorType} onChange={(event) => setBridgeActorType(event.target.value)} disabled={bridgeBusy}>
            <option value="user">User</option>
            <option value="native_agent">{AGENT_DISPLAY_NAME}</option>
            <option value="byo_agent">{SPECIALIST_AGENT_LABEL}</option>
          </select>
        </div>
        <div className="settings-import-field">
          <p className="muted-label">{SPECIALIST_AGENT_LABEL} (if selected)</p>
          <select
            value={bridgeActorId}
            onChange={(event) => setBridgeActorId(event.target.value)}
            disabled={bridgeBusy || bridgeActorType !== 'byo_agent'}
          >
            <option value="">Select specialist agent</option>
            {activePersonalAgents.map(agent => (
              <option key={agent._id} value={agent._id}>{agent.name}</option>
            ))}
          </select>
          {bridgeActorType === 'byo_agent' && activePersonalAgents.length === 0 && (
            <p className="muted small">
              No active specialist agents yet. <Link to="/integrations#personal-agents">Set up an agent</Link>.
            </p>
          )}
        </div>
        <div className="settings-import-field">
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
      <div className="settings-import-row external-bridge-scope-row">
        <div className="settings-import-field settings-import-field--grow">
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
        <div className="import-summary external-bridge-post-mint">
          <div className="external-bridge-token-well" role="region" aria-label="Bridge token">
            <div className="external-bridge-token-well__header">
              <p className="muted-label external-bridge-token-well__label">Bridge token (shown once)</p>
              <Button type="button" variant="secondary" onClick={handleCopyToken}>
                {tokenCopyStatus === 'copied' ? 'Copied' : 'Copy token'}
              </Button>
            </div>
            <p className="external-bridge-token-well__warn">
              Store this outside the app if you need it later. It will not be shown again after you leave this page.
            </p>
            <pre className="external-bridge-pre external-bridge-token-well__value">{bridgeToken}</pre>
            {tokenCopyStatus === 'error' && (
              <p className="status-message error-message external-bridge-token-well__copy-err">Clipboard unavailable. Select the token and copy manually.</p>
            )}
          </div>

          <div className="external-bridge-primary-actions" role="group" aria-label="Bridge actions">
            <Button variant="secondary" disabled={bridgeManifestLoading} onClick={handleTestBridgeConnection}>
              {bridgeManifestLoading ? 'Testing…' : 'Test bridge connection'}
            </Button>
            <Button variant="secondary" onClick={() => handleCopyBridgeConfig(selectedAgentName)}>
              Copy OpenClaw config
            </Button>
          </div>
          {bridgeCopyStatus && (
            <p className={`status-message ${/copied/i.test(bridgeCopyStatus) ? 'success-message' : 'error-message'}`}>
              {bridgeCopyStatus}
            </p>
          )}
          {bridgeManifestError && <p className="status-message error-message">{bridgeManifestError}</p>}
          {bridgeManifest && (
            <div className="external-bridge-verify-banner">
              <p className="status-message success-message">Bridge verified</p>
              <p className="muted small">
                {bridgeManifest.protocol} for {bridgeManifest.actor?.actorType || bridgeActorType} on {bridgeManifest.scope || bridgeScope}.
              </p>
              {manifestCapabilities.length > 0 && (
                <p className="muted small">
                  {manifestCapabilities.join(' • ')}
                </p>
              )}
            </div>
          )}

          <SegmentedNav
            className="external-bridge-tabs"
            appearance="quiet"
            items={[
              { value: 'config', label: 'Config' },
              { value: 'reference', label: 'Reference' }
            ]}
            value={postMintTab}
            onChange={setPostMintTab}
          />

          {postMintTab === 'config' && (
            <div className="external-bridge-panel" role="tabpanel">
              <p className="muted-label">Bridge quickstart</p>
              <p className="muted small">
                Copy a ready-to-paste OpenClaw config, then verify the manifest before handing the bridge to an external runtime.
              </p>
              <p className="muted-label external-bridge-panel__pre-label">OpenClaw config</p>
              <pre className="external-bridge-pre">{bridgeConfigPreview}</pre>
            </div>
          )}

          {postMintTab === 'reference' && (
            <div className="external-bridge-panel external-bridge-panel--reference" role="tabpanel">
              <pre className="external-bridge-pre external-bridge-pre--tight">{`Bridge endpoints:
GET  /api/agent/protocol/bridge/manifest
POST /api/agent/protocol/bridge/a2a
POST /api/agent/protocol/bridge/mcp`}
              </pre>
              <div className="external-bridge-reference-grid">
                <div>
                  <p className="muted-label">A2A example: claim routed work as a specialist worker</p>
                  <pre className="external-bridge-pre">{buildA2aExample(bridgeToken)}</pre>
                </div>
                <div>
                  <p className="muted-label">MCP example: promote a draft</p>
                  <pre className="external-bridge-pre">{buildMcpExample()}</pre>
                </div>
                <div>
                  <p className="muted-label">Shared workflow</p>
                  <pre className="external-bridge-pre">{buildWorkflowExample()}</pre>
                </div>
                <div>
                  <p className="muted-label">Bridge methods</p>
                  <pre className="external-bridge-pre">{BRIDGE_METHODS_LIST}</pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="import-summary external-bridge-approvals">
        <p className="muted-label">Pending protocol approvals</p>
        <p className="muted small">
          Bridge-issued writes from non-user specialist workers pause here before they can mutate shared threads or handoffs.
        </p>
        {protocolApprovalsLoading ? (
          <p className="muted small">Loading protocol approvals…</p>
        ) : protocolApprovals.length === 0 ? (
          <p className="muted small">No pending protocol approvals.</p>
        ) : (
          <div className="external-bridge-approval-list">
            {protocolApprovals.map((approval) => {
              const approvalId = String(approval?.approvalId || '');
              const busy = protocolApprovalBusyId === approvalId;
              return (
                <div key={approvalId} className="external-bridge-approval-item">
                  <p className="external-bridge-approval-title">{approval.op || 'Protocol action'}</p>
                  {approval.reason && <p className="muted small external-bridge-approval-reason">{approval.reason}</p>}
                  <div className="settings-import-row external-bridge-approval-meta">
                    {approval.preview?.title && <span className="muted small">{approval.preview.title}</span>}
                    {approval.preview?.threadId && <span className="muted small">thread {approval.preview.threadId}</span>}
                    {approval.preview?.handoffId && <span className="muted small">handoff {approval.preview.handoffId}</span>}
                    <span className="muted small">{approval.requestedBy?.actorType || 'agent'}</span>
                  </div>
                  <div className="settings-import-row external-bridge-approval-actions">
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
