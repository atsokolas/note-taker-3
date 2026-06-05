import React, { useCallback, useMemo, useState } from 'react';
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

const RUNTIME_OPTIONS = [
  {
    value: 'openclaw',
    label: 'OpenClaw',
    title: 'OpenClaw',
    summary: 'Best for delegated research and routed handoff work.',
    configLabel: 'OpenClaw config',
    copyLabel: 'Copy OpenClaw config'
  },
  {
    value: 'hermes',
    label: 'Hermes',
    title: 'Hermes',
    summary: 'Best for an MCP-first runtime that calls JSON-RPC bridge methods.',
    configLabel: 'Hermes MCP config',
    copyLabel: 'Copy Hermes config'
  }
];

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

const formatActorName = ({ actorType = 'user', actorName = '' } = {}) => (
  actorName || (actorType === 'native_agent' ? AGENT_DISPLAY_NAME : actorType === 'byo_agent' ? SPECIALIST_AGENT_LABEL : USER_BRIDGE_LABEL)
);

const buildOpenClawConfig = ({
  bridgeToken = '',
  scope = 'agent_ops',
  actorType = 'user',
  actorName = '',
  expiresInSec = 1800
}) => {
  const baseUrl = resolveBridgeBaseUrl();
  return JSON.stringify({
    name: formatActorName({ actorType, actorName }),
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

const buildHermesConfig = ({
  bridgeToken = '',
  scope = 'agent_ops',
  actorType = 'user',
  actorName = '',
  expiresInSec = 1800
}) => {
  const baseUrl = resolveBridgeBaseUrl();
  return JSON.stringify({
    servers: {
      'noeis-agent-bridge': {
        transport: 'http',
        url: `${baseUrl}/api/agent/protocol/bridge/mcp`,
        headers: {
          Authorization: `Bearer ${bridgeToken}`
        },
        metadata: {
          name: formatActorName({ actorType, actorName }),
          protocol: 'note-taker-agent-bridge-v1',
          manifest_url: `${baseUrl}/api/agent/protocol/bridge/manifest`,
          scope,
          expires_in_sec: expiresInSec
        }
      }
    }
  }, null, 2);
};

const buildRuntimeConfig = ({ runtime = 'openclaw', ...config }) => (
  runtime === 'hermes' ? buildHermesConfig(config) : buildOpenClawConfig(config)
);

const listEnabledCapabilities = (capabilities = {}) => Object.entries(capabilities)
  .filter(([, enabled]) => Boolean(enabled))
  .map(([key]) => CAPABILITY_LABELS[key] || key);

const getBridgeState = ({ bridgeToken, bridgeManifest, bridgeManifestLoading }) => {
  if (bridgeManifestLoading) return { label: 'Checking', tone: 'working', detail: 'Manifest request in progress.' };
  if (bridgeManifest) return { label: 'Verified', tone: 'ready', detail: 'Noeis accepted the token and returned bridge capabilities.' };
  if (bridgeToken) return { label: 'Ready to test', tone: 'pending', detail: 'Token minted. Test the manifest before handing it to the runtime.' };
  return { label: 'Not connected', tone: 'idle', detail: 'Create a short-lived bridge token to begin.' };
};

const statusClass = (tone = 'idle') => `external-bridge-status is-${tone}`;

const ExternalBridgeCard = ({
  bridgeModel,
  sortedAgents = []
}) => {
  const [postMintTab, setPostMintTab] = useState('config');
  const [selectedRuntime, setSelectedRuntime] = useState('openclaw');
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
  const runtime = RUNTIME_OPTIONS.find(option => option.value === selectedRuntime) || RUNTIME_OPTIONS[0];
  const bridgeStatus = getBridgeState({ bridgeToken, bridgeManifest, bridgeManifestLoading });
  const bridgeScopeValue = bridgeMeta?.scope || bridgeScope;
  const bridgeExpiry = bridgeMeta?.expiresInSec || bridgeTtl;
  const previewBridgeToken = bridgeToken || '<minted-bridge-token>';

  const bridgeConfigPreview = useMemo(() => (
    buildRuntimeConfig({
      runtime: selectedRuntime,
      bridgeToken: previewBridgeToken,
      scope: bridgeScopeValue,
      actorType: bridgeActorType,
      actorName: selectedAgentName,
      expiresInSec: bridgeExpiry
    })
  ), [bridgeActorType, bridgeExpiry, bridgeScopeValue, previewBridgeToken, selectedAgentName, selectedRuntime]);

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

  const setupSteps = [
    {
      label: activePersonalAgents.length > 0 ? 'Specialist agent ready' : 'Create a specialist agent',
      done: activePersonalAgents.length > 0,
      detail: activePersonalAgents.length > 0
        ? `${activePersonalAgents.length} active specialist worker${activePersonalAgents.length === 1 ? '' : 's'} available.`
        : 'Create an OpenClaw or Hermes worker above so the bridge can route work to it.'
    },
    {
      label: 'Bridge token minted',
      done: Boolean(bridgeToken),
      detail: bridgeToken ? `${bridgeExpiry}s token for ${bridgeScopeValue}.` : 'Mint a short-lived token scoped to agent_ops.'
    },
    {
      label: 'Manifest verified',
      done: Boolean(bridgeManifest),
      detail: bridgeManifest ? 'Runtime can read available bridge capabilities.' : 'Run the manifest check before handing over the config.'
    },
    {
      label: `${runtime.title} config template ready`,
      done: true,
      detail: bridgeToken
        ? `Copy the ${runtime.configLabel.toLowerCase()} below.`
        : `Use the visible template now; mint a token to make it runnable.`
    }
  ];

  return (
    <Card className="settings-card external-bridge-card" id="byo-agent-bridge">
      <div className="external-bridge-hero">
        <div>
          <p className="muted-label">BYO agent bridge</p>
          <h2>Connect OpenClaw or Hermes</h2>
          <p className="muted">
            Plug an external runtime into Noeis as a specialist worker. It can read shared threads, claim routed handoffs, stage artifact drafts, promote drafts, and report back through the same approval path.
          </p>
        </div>
        <div className={statusClass(bridgeStatus.tone)} aria-label="Bridge connection status">
          <span>{bridgeStatus.label}</span>
          <p>{bridgeStatus.detail}</p>
        </div>
      </div>

      <div className="external-bridge-runtime-grid" role="group" aria-label="Runtime">
        {RUNTIME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`external-bridge-runtime ${selectedRuntime === option.value ? 'is-active' : ''}`.trim()}
            aria-pressed={selectedRuntime === option.value}
            onClick={() => setSelectedRuntime(option.value)}
          >
            <span>{option.title}</span>
            <p>{option.summary}</p>
          </button>
        ))}
      </div>

      <div className="external-bridge-setup-grid">
        <div className="external-bridge-setup-panel">
          <p className="muted-label">Setup path</p>
          <ol className="external-bridge-checklist">
            {setupSteps.map((step) => (
              <li key={step.label} className={step.done ? 'is-done' : ''}>
                <span aria-hidden="true" />
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="external-bridge-setup-panel">
          <p className="muted-label">Runtime permissions</p>
          <div className="external-bridge-capability-list">
            {(manifestCapabilities.length > 0 ? manifestCapabilities : [
              'Shared threads',
              'Protocol handoffs',
              'Artifact drafts',
              'Worker roles'
            ]).slice(0, 8).map((capability) => (
              <span key={capability}>{capability}</span>
            ))}
          </div>
          {bridgeManifest && (
            <p className="muted small external-bridge-protocol-line">
              {bridgeManifest.protocol} for {bridgeManifest.actor?.actorType || bridgeActorType} on {bridgeManifest.scope || bridgeScopeValue}.
            </p>
          )}
        </div>
      </div>

      {activePersonalAgents.length > 0 && (
        <div className="import-summary external-bridge-agent-block">
          <p className="muted-label">Active specialist workers</p>
          <div className="external-bridge-agent-grid">
            {activePersonalAgents.map((agent) => (
              <div key={agent._id} className="external-bridge-agent-row">
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

      <div className="external-bridge-mint-panel">
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
            <p className="muted-label">{SPECIALIST_AGENT_LABEL} worker</p>
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
            {bridgeBusy ? 'Minting...' : 'Mint bridge token'}
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
      </div>

      {bridgeError && <p className="status-message error-message">{bridgeError}</p>}
      {protocolApprovalsError && <p className="status-message error-message">{protocolApprovalsError}</p>}

      <div className="import-summary external-bridge-post-mint">
        {bridgeToken ? (
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
        ) : (
          <div className="external-bridge-empty">
            <p className="muted-label">Runtime config template</p>
            <p className="muted small">
              This shows the exact {runtime.title} bridge shape. Mint a bridge token to enable copy and manifest verification.
            </p>
          </div>
        )}

        <div className="external-bridge-primary-actions" role="group" aria-label="Bridge actions">
          <Button variant="secondary" disabled={!bridgeToken || bridgeManifestLoading} onClick={handleTestBridgeConnection}>
            {bridgeManifestLoading ? 'Testing...' : 'Test bridge connection'}
          </Button>
          <Button variant="secondary" disabled={!bridgeToken} onClick={() => handleCopyBridgeConfig(selectedAgentName, selectedRuntime)}>
            {runtime.copyLabel}
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
            <p className="muted small">The selected token can read the manifest and bridge capabilities.</p>
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
              Copy this {runtime.title} configuration, start the runtime, then run the manifest check again from Noeis.
            </p>
            <p className="muted-label external-bridge-panel__pre-label">{runtime.configLabel}</p>
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
                <pre className="external-bridge-pre">{buildA2aExample(previewBridgeToken)}</pre>
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

      <div className="import-summary external-bridge-approvals">
        <p className="muted-label">Pending protocol approvals</p>
        <p className="muted small">
          Bridge-issued writes from non-user specialist workers pause here before they can mutate shared threads or handoffs.
        </p>
        {protocolApprovalsLoading ? (
          <p className="muted small">Loading protocol approvals...</p>
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
                      {busy ? 'Applying...' : 'Approve'}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => handleRejectProtocolApproval(approvalId)}
                    >
                      {busy ? 'Working...' : 'Reject'}
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
