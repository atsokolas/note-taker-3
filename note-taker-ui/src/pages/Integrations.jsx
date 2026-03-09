import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { Page, Card, Button } from '../components/ui';
import {
  cancelAgentHandoff,
  claimAgentHandoff,
  completeAgentHandoff,
  createAgentBridgeToken,
  createAgentHandoff,
  createAutoAgentHandoff,
  createPersonalAgent,
  disablePersonalAgent,
  getAgentEntitlements,
  getAgentProtocolPolicy,
  listAgentHandoffs,
  listPersonalAgents,
  rejectAgentHandoff,
  rotatePersonalAgentKey,
  updateAgentEntitlementsDev,
  updateAgentProtocolPolicy
} from '../api/agent';

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

const Integrations = () => {
  const [importStatus, setImportStatus] = useState('');
  const [importStats, setImportStats] = useState(null);
  const [importing, setImporting] = useState(false);
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [agentBusyId, setAgentBusyId] = useState('');
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [newAgentKey, setNewAgentKey] = useState('');
  const [entitlements, setEntitlements] = useState({
    premiumTier: 'free',
    webResearchEnabled: false,
    webResearchBetaEnabled: false,
    premiumWebResearchAvailable: false
  });
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [entitlementsSaving, setEntitlementsSaving] = useState(false);
  const [entitlementsError, setEntitlementsError] = useState('');
  const [handoffs, setHandoffs] = useState([]);
  const [handoffsLoading, setHandoffsLoading] = useState(false);
  const [handoffsError, setHandoffsError] = useState('');
  const [handoffStatusFilter, setHandoffStatusFilter] = useState('all');
  const [handoffActionBusyId, setHandoffActionBusyId] = useState('');
  const [handoffActionError, setHandoffActionError] = useState('');
  const [newHandoffTitle, setNewHandoffTitle] = useState('');
  const [newHandoffObjective, setNewHandoffObjective] = useState('');
  const [newHandoffTaskType, setNewHandoffTaskType] = useState('research');
  const [newHandoffPriority, setNewHandoffPriority] = useState('normal');
  const [newHandoffRequestedActorType, setNewHandoffRequestedActorType] = useState('native_agent');
  const [newHandoffRequestedActorId, setNewHandoffRequestedActorId] = useState('');
  const [newHandoffDueAt, setNewHandoffDueAt] = useState('');
  const [newHandoffAutoRoute, setNewHandoffAutoRoute] = useState(true);
  const [handoffCreating, setHandoffCreating] = useState(false);
  const [handoffCreateError, setHandoffCreateError] = useState('');
  const [handoffCreateInfo, setHandoffCreateInfo] = useState('');
  const [queueActorType, setQueueActorType] = useState('user');
  const [queueActorId, setQueueActorId] = useState('');
  const [protocolPolicy, setProtocolPolicy] = useState({
    routingMode: 'balanced',
    defaultByoAgentId: '',
    allowByoForResearch: true,
    allowByoForSynthesis: true
  });
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyError, setPolicyError] = useState('');
  const [bridgeActorType, setBridgeActorType] = useState('user');
  const [bridgeActorId, setBridgeActorId] = useState('');
  const [bridgeScope, setBridgeScope] = useState('handoff_ops');
  const [bridgeTtl, setBridgeTtl] = useState(1800);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const [bridgeToken, setBridgeToken] = useState('');

  const formatDate = useCallback((value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString();
  }, []);

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    setAgentsError('');
    try {
      const rows = await listPersonalAgents();
      setAgents(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setAgentsError(error.response?.data?.error || 'Failed to load personal agents.');
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const loadEntitlements = useCallback(async () => {
    setEntitlementsLoading(true);
    setEntitlementsError('');
    try {
      const response = await getAgentEntitlements();
      setEntitlements({
        premiumTier: String(response?.entitlements?.premiumTier || 'free'),
        webResearchEnabled: Boolean(response?.entitlements?.webResearchEnabled),
        webResearchBetaEnabled: Boolean(response?.entitlements?.webResearchBetaEnabled),
        premiumWebResearchAvailable: Boolean(response?.entitlements?.premiumWebResearchAvailable)
      });
    } catch (error) {
      setEntitlementsError(error.response?.data?.error || 'Failed to load agent entitlements.');
    } finally {
      setEntitlementsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntitlements();
  }, [loadEntitlements]);

  const loadProtocolPolicy = useCallback(async () => {
    setPolicyLoading(true);
    setPolicyError('');
    try {
      const response = await getAgentProtocolPolicy();
      const policy = response?.policy || {};
      setProtocolPolicy({
        routingMode: String(policy.routingMode || 'balanced'),
        defaultByoAgentId: String(policy.defaultByoAgentId || ''),
        allowByoForResearch: policy.allowByoForResearch !== false,
        allowByoForSynthesis: policy.allowByoForSynthesis !== false
      });
    } catch (error) {
      setPolicyError(error.response?.data?.error || 'Failed to load orchestration policy.');
    } finally {
      setPolicyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProtocolPolicy();
  }, [loadProtocolPolicy]);

  const loadHandoffs = useCallback(async () => {
    setHandoffsLoading(true);
    setHandoffsError('');
    try {
      const response = await listAgentHandoffs({
        status: handoffStatusFilter || 'all',
        limit: 60
      });
      setHandoffs(Array.isArray(response?.handoffs) ? response.handoffs : []);
    } catch (error) {
      setHandoffsError(error.response?.data?.error || 'Failed to load handoffs.');
      setHandoffs([]);
    } finally {
      setHandoffsLoading(false);
    }
  }, [handoffStatusFilter]);

  useEffect(() => {
    loadHandoffs();
  }, [loadHandoffs]);

  const sortedAgents = useMemo(() => (
    [...agents].sort((a, b) => {
      const aTime = new Date(a?.updatedAt || 0).getTime();
      const bTime = new Date(b?.updatedAt || 0).getTime();
      return bTime - aTime;
    })
  ), [agents]);

  const agentNameById = useMemo(() => {
    const map = new Map();
    sortedAgents.forEach((agent) => {
      map.set(String(agent?._id || ''), String(agent?.name || 'BYO agent'));
    });
    return map;
  }, [sortedAgents]);

  const formatActor = useCallback((actor = {}) => {
    const actorType = String(actor?.actorType || '').trim();
    const actorId = String(actor?.actorId || '').trim();
    if (actorType === 'user') return 'User';
    if (actorType === 'native_agent') return actorId ? `Native (${actorId})` : 'Native agent';
    if (actorType === 'byo_agent') return agentNameById.get(actorId) || `BYO (${actorId || 'unknown'})`;
    return 'Unknown actor';
  }, [agentNameById]);

  const handleReadwiseImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportStatus('Importing Readwise CSV...');
    setImportStats(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/import/readwise', formData, getAuthConfig());
      setImportStats({
        importedArticles: res.data.importedArticles || 0,
        importedHighlights: res.data.importedHighlights || 0,
        skippedRows: res.data.skippedRows || 0,
        parseErrors: res.data.parseErrors || 0
      });
      setImportStatus('Readwise import complete.');
    } catch (err) {
      console.error('Readwise import failed:', err);
      setImportStatus(err.response?.data?.error || 'Failed to import Readwise CSV.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const handleCreateAgent = async () => {
    const name = String(agentName || '').trim();
    if (!name || creatingAgent) return;
    setCreatingAgent(true);
    setAgentsError('');
    setNewAgentKey('');
    try {
      const response = await createPersonalAgent({
        name,
        description: String(agentDescription || '').trim()
      });
      await loadAgents();
      setAgentName('');
      setAgentDescription('');
      setNewAgentKey(String(response?.apiKey || '').trim());
    } catch (error) {
      setAgentsError(error.response?.data?.error || 'Failed to create personal agent.');
    } finally {
      setCreatingAgent(false);
    }
  };

  const handleRotateKey = async (agentId) => {
    const safeId = String(agentId || '').trim();
    if (!safeId || agentBusyId) return;
    setAgentBusyId(safeId);
    setAgentsError('');
    setNewAgentKey('');
    try {
      const response = await rotatePersonalAgentKey(safeId);
      await loadAgents();
      setNewAgentKey(String(response?.apiKey || '').trim());
    } catch (error) {
      setAgentsError(error.response?.data?.error || 'Failed to rotate personal agent key.');
    } finally {
      setAgentBusyId('');
    }
  };

  const handleDisableAgent = async (agentId) => {
    const safeId = String(agentId || '').trim();
    if (!safeId || agentBusyId) return;
    setAgentBusyId(safeId);
    setAgentsError('');
    try {
      await disablePersonalAgent(safeId);
      await loadAgents();
    } catch (error) {
      setAgentsError(error.response?.data?.error || 'Failed to disable personal agent.');
    } finally {
      setAgentBusyId('');
    }
  };

  const handleSetEntitlementsDev = async (profile) => {
    setEntitlementsSaving(true);
    setEntitlementsError('');
    try {
      const response = await updateAgentEntitlementsDev(profile);
      setEntitlements({
        premiumTier: String(response?.entitlements?.premiumTier || 'free'),
        webResearchEnabled: Boolean(response?.entitlements?.webResearchEnabled),
        webResearchBetaEnabled: Boolean(response?.entitlements?.webResearchBetaEnabled),
        premiumWebResearchAvailable: Boolean(response?.entitlements?.premiumWebResearchAvailable)
      });
    } catch (error) {
      setEntitlementsError(error.response?.data?.error || 'Failed to update entitlements.');
    } finally {
      setEntitlementsSaving(false);
    }
  };

  const handleSaveProtocolPolicy = async () => {
    setPolicySaving(true);
    setPolicyError('');
    try {
      const response = await updateAgentProtocolPolicy({
        routingMode: protocolPolicy.routingMode,
        defaultByoAgentId: protocolPolicy.defaultByoAgentId || '',
        allowByoForResearch: Boolean(protocolPolicy.allowByoForResearch),
        allowByoForSynthesis: Boolean(protocolPolicy.allowByoForSynthesis)
      });
      const policy = response?.policy || {};
      setProtocolPolicy({
        routingMode: String(policy.routingMode || 'balanced'),
        defaultByoAgentId: String(policy.defaultByoAgentId || ''),
        allowByoForResearch: policy.allowByoForResearch !== false,
        allowByoForSynthesis: policy.allowByoForSynthesis !== false
      });
    } catch (error) {
      setPolicyError(error.response?.data?.error || 'Failed to save orchestration policy.');
    } finally {
      setPolicySaving(false);
    }
  };

  const resolveQueueActorPayload = useCallback(() => {
    const actorType = String(queueActorType || 'user').trim();
    if (actorType === 'user') {
      return { actorType: 'user' };
    }
    if (actorType === 'native_agent') {
      return { actorType: 'native_agent', actorId: String(queueActorId || '').trim() };
    }
    const actorId = String(queueActorId || '').trim();
    if (!actorId) throw new Error('Select a BYO agent before running this action.');
    return { actorType: 'byo_agent', actorId };
  }, [queueActorId, queueActorType]);

  const handleCreateHandoff = async () => {
    const title = String(newHandoffTitle || '').trim();
    if (!title || handoffCreating) return;
    setHandoffCreating(true);
    setHandoffCreateError('');
    setHandoffCreateInfo('');
    try {
      const payload = {
        title,
        objective: String(newHandoffObjective || '').trim(),
        taskType: newHandoffTaskType,
        priority: newHandoffPriority,
        dueAt: String(newHandoffDueAt || '').trim() || undefined,
        context: {},
        input: {}
      };
      let response;
      if (newHandoffAutoRoute) {
        response = await createAutoAgentHandoff(payload);
        const plannerSource = String(response?.planner?.routeSource || '').trim();
        if (plannerSource) setHandoffCreateInfo(`Auto-routed via ${plannerSource}.`);
      } else {
        response = await createAgentHandoff({
          ...payload,
          requestedActor: {
            actorType: newHandoffRequestedActorType,
            actorId: newHandoffRequestedActorType === 'byo_agent'
              ? String(newHandoffRequestedActorId || '').trim()
              : ''
          }
        });
      }

      if (!response?.handoff?.handoffId) {
        setHandoffCreateInfo('Handoff created.');
      }
      setNewHandoffTitle('');
      setNewHandoffObjective('');
      setNewHandoffDueAt('');
      await loadHandoffs();
    } catch (error) {
      setHandoffCreateError(error.response?.data?.error || error.message || 'Failed to create handoff.');
    } finally {
      setHandoffCreating(false);
    }
  };

  const handleClaimHandoff = async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    try {
      const actor = resolveQueueActorPayload();
      await claimAgentHandoff(safeId, actor);
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to claim handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  };

  const handleCompleteHandoff = async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    try {
      const actor = resolveQueueActorPayload();
      const note = window.prompt('Completion note (optional):', '') || '';
      await completeAgentHandoff(safeId, {
        ...actor,
        note: String(note || '').trim(),
        output: note ? { summary: String(note).trim() } : {}
      });
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to complete handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  };

  const handleRejectHandoff = async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    try {
      const actor = resolveQueueActorPayload();
      const note = window.prompt('Reject reason (optional):', '') || '';
      await rejectAgentHandoff(safeId, {
        ...actor,
        note: String(note || '').trim()
      });
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to reject handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  };

  const handleCancelHandoff = async (handoffId) => {
    const safeId = String(handoffId || '').trim();
    if (!safeId || handoffActionBusyId) return;
    setHandoffActionBusyId(safeId);
    setHandoffActionError('');
    try {
      await cancelAgentHandoff(safeId, {});
      await loadHandoffs();
    } catch (error) {
      setHandoffActionError(error.response?.data?.error || error.message || 'Failed to cancel handoff.');
    } finally {
      setHandoffActionBusyId('');
    }
  };

  const handleCreateBridgeToken = async () => {
    setBridgeBusy(true);
    setBridgeError('');
    setBridgeToken('');
    try {
      const payload = {
        actorType: bridgeActorType,
        actorId: bridgeActorType === 'byo_agent' ? String(bridgeActorId || '').trim() : '',
        scope: String(bridgeScope || 'handoff_ops').trim() || 'handoff_ops',
        ttlSeconds: Number(bridgeTtl) || 1800
      };
      const response = await createAgentBridgeToken(payload);
      setBridgeToken(String(response?.bridgeToken || '').trim());
    } catch (error) {
      setBridgeError(error.response?.data?.error || 'Failed to create bridge token.');
    } finally {
      setBridgeBusy(false);
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Integrations</h1>
        <p className="muted">Bring your library in, export clean markdown, and share public concepts.</p>
      </div>

      <Card className="settings-card">
        <h2>Personal agents</h2>
        <p className="muted">
          Create user-scoped agent keys for BYO agents. These agents only access your private workspace and follow the same
          delete approval policy.
        </p>

        <div className="settings-import-row">
          <div style={{ flex: 1 }}>
            <p className="muted-label">Agent name</p>
            <input
              type="text"
              value={agentName}
              onChange={(event) => setAgentName(event.target.value)}
              placeholder="My local research agent"
              disabled={creatingAgent}
            />
          </div>
          <Button variant="secondary" disabled={creatingAgent || !String(agentName || '').trim()} onClick={handleCreateAgent}>
            {creatingAgent ? 'Creating…' : 'Create agent'}
          </Button>
        </div>

        <div className="settings-import-row">
          <div style={{ flex: 1 }}>
            <p className="muted-label">Description (optional)</p>
            <input
              type="text"
              value={agentDescription}
              onChange={(event) => setAgentDescription(event.target.value)}
              placeholder="Used from my local automation scripts"
              disabled={creatingAgent}
            />
          </div>
        </div>

        {newAgentKey && (
          <div className="import-summary">
            <p className="muted-label">New API key (shown once)</p>
            <p style={{ wordBreak: 'break-all' }}>{newAgentKey}</p>
          </div>
        )}

        <div className="import-summary">
          <p className="muted-label">BYO agent API (private workspace only)</p>
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

      <Card className="settings-card">
        <h2>Agent handoff queue</h2>
        <p className="muted">Create, triage, and close handoffs shared between user, native, and BYO agents.</p>

        <div className="settings-import-row">
          <div style={{ flex: 1 }}>
            <p className="muted-label">Title</p>
            <input
              type="text"
              value={newHandoffTitle}
              onChange={(event) => setNewHandoffTitle(event.target.value)}
              placeholder="Investigate contradictions in concept workspace"
              disabled={handoffCreating}
            />
          </div>
          <Button variant="secondary" disabled={handoffCreating || !String(newHandoffTitle || '').trim()} onClick={handleCreateHandoff}>
            {handoffCreating ? 'Creating…' : (newHandoffAutoRoute ? 'Auto plan + create' : 'Create handoff')}
          </Button>
        </div>

        <div className="settings-import-row">
          <div style={{ flex: 2 }}>
            <p className="muted-label">Objective (optional)</p>
            <input
              type="text"
              value={newHandoffObjective}
              onChange={(event) => setNewHandoffObjective(event.target.value)}
              placeholder="Gather sources, summarize findings, and propose next steps"
              disabled={handoffCreating}
            />
          </div>
        </div>

        <div className="settings-import-row">
          <div style={{ flex: 1 }}>
            <p className="muted-label">Task type</p>
            <select value={newHandoffTaskType} onChange={(event) => setNewHandoffTaskType(event.target.value)} disabled={handoffCreating}>
              <option value="research">Research</option>
              <option value="synthesis">Synthesis</option>
              <option value="restructure">Restructure</option>
              <option value="qa">QA</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <p className="muted-label">Priority</p>
            <select value={newHandoffPriority} onChange={(event) => setNewHandoffPriority(event.target.value)} disabled={handoffCreating}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <p className="muted-label">Due at (optional)</p>
            <input
              type="datetime-local"
              value={newHandoffDueAt}
              onChange={(event) => setNewHandoffDueAt(event.target.value)}
              disabled={handoffCreating}
            />
          </div>
        </div>

        <div className="settings-import-row" style={{ marginTop: 8 }}>
          <label className="muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={newHandoffAutoRoute}
              onChange={(event) => setNewHandoffAutoRoute(event.target.checked)}
              disabled={handoffCreating}
            />
            Auto route with policy
          </label>
          {!newHandoffAutoRoute && (
            <>
              <select
                value={newHandoffRequestedActorType}
                onChange={(event) => setNewHandoffRequestedActorType(event.target.value)}
                disabled={handoffCreating}
              >
                <option value="native_agent">Native agent</option>
                <option value="user">User</option>
                <option value="byo_agent">BYO agent</option>
              </select>
              {newHandoffRequestedActorType === 'byo_agent' && (
                <select
                  value={newHandoffRequestedActorId}
                  onChange={(event) => setNewHandoffRequestedActorId(event.target.value)}
                  disabled={handoffCreating}
                >
                  <option value="">Select BYO agent</option>
                  {sortedAgents
                    .filter(agent => agent.status === 'active')
                    .map(agent => (
                      <option key={agent._id} value={agent._id}>{agent.name}</option>
                    ))}
                </select>
              )}
            </>
          )}
        </div>

        {handoffCreateError && <p className="status-message error-message">{handoffCreateError}</p>}
        {!handoffCreateError && handoffCreateInfo && <p className="status-message">{handoffCreateInfo}</p>}

        <div className="settings-import-row" style={{ marginTop: 14 }}>
          <div>
            <p className="muted-label">Queue status</p>
            <select value={handoffStatusFilter} onChange={(event) => setHandoffStatusFilter(event.target.value)} disabled={handoffsLoading}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="claimed">Claimed</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <p className="muted-label">Run actions as</p>
            <div className="settings-import-row">
              <select value={queueActorType} onChange={(event) => setQueueActorType(event.target.value)}>
                <option value="user">User</option>
                <option value="native_agent">Native agent</option>
                <option value="byo_agent">BYO agent</option>
              </select>
              {queueActorType === 'byo_agent' && (
                <select value={queueActorId} onChange={(event) => setQueueActorId(event.target.value)}>
                  <option value="">Select BYO agent</option>
                  {sortedAgents
                    .filter(agent => agent.status === 'active')
                    .map(agent => (
                      <option key={agent._id} value={agent._id}>{agent.name}</option>
                    ))}
                </select>
              )}
            </div>
          </div>
          <Button variant="secondary" disabled={handoffsLoading} onClick={loadHandoffs}>
            Refresh queue
          </Button>
        </div>

        {handoffsLoading ? (
          <p className="muted small">Loading handoffs…</p>
        ) : handoffs.length === 0 ? (
          <p className="muted small">No handoffs for this filter.</p>
        ) : (
          <div className="import-summary">
            {handoffs.map((handoff) => {
              const handoffId = String(handoff?.handoffId || '');
              const isBusy = handoffActionBusyId === handoffId;
              return (
                <div key={handoffId} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
                  <p><strong>{handoff.title}</strong> · {handoff.status} · {handoff.taskType} · {handoff.priority}</p>
                  {handoff.objective && <p className="muted">{handoff.objective}</p>}
                  <p>Requested: {formatActor(handoff.requestedActor)}</p>
                  {handoff.claimedBy && <p>Claimed by: {formatActor(handoff.claimedBy)}</p>}
                  {handoff.completedBy && <p>Completed by: {formatActor(handoff.completedBy)}</p>}
                  {handoff.dueAt && <p>Due: {formatDate(handoff.dueAt)}</p>}
                  <div className="settings-import-row" style={{ marginTop: 8 }}>
                    <Button variant="secondary" disabled={isBusy} onClick={() => handleClaimHandoff(handoffId)}>
                      {isBusy ? 'Working…' : 'Claim'}
                    </Button>
                    <Button variant="secondary" disabled={isBusy} onClick={() => handleCompleteHandoff(handoffId)}>
                      {isBusy ? 'Working…' : 'Complete'}
                    </Button>
                    <Button variant="secondary" disabled={isBusy} onClick={() => handleRejectHandoff(handoffId)}>
                      {isBusy ? 'Working…' : 'Reject'}
                    </Button>
                    <Button variant="secondary" disabled={isBusy} onClick={() => handleCancelHandoff(handoffId)}>
                      {isBusy ? 'Working…' : 'Cancel'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {handoffsError && <p className="status-message error-message">{handoffsError}</p>}
        {handoffActionError && <p className="status-message error-message">{handoffActionError}</p>}
      </Card>

      <Card className="settings-card">
        <h2>External bridge (A2A + MCP adapter)</h2>
        <p className="muted">
          Mint signed bridge identities for external agent runtimes and call protocol adapters.
        </p>
        <div className="settings-import-row">
          <div style={{ flex: 1 }}>
            <p className="muted-label">Actor type</p>
            <select value={bridgeActorType} onChange={(event) => setBridgeActorType(event.target.value)} disabled={bridgeBusy}>
              <option value="user">User</option>
              <option value="native_agent">Native agent</option>
              <option value="byo_agent">BYO agent</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <p className="muted-label">BYO actor (if selected)</p>
            <select
              value={bridgeActorId}
              onChange={(event) => setBridgeActorId(event.target.value)}
              disabled={bridgeBusy || bridgeActorType !== 'byo_agent'}
            >
              <option value="">Select BYO agent</option>
              {sortedAgents
                .filter(agent => agent.status === 'active')
                .map(agent => (
                  <option key={agent._id} value={agent._id}>{agent.name}</option>
                ))}
            </select>
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

      <Card className="settings-card">
        <h2>Import</h2>
        <p className="muted">Upload a Readwise CSV to seed your highlights.</p>
        <div className="settings-import-row">
          <div>
            <p className="muted-label">Readwise CSV</p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleReadwiseImport}
              disabled={importing}
            />
          </div>
          <Button variant="secondary" disabled={importing}>
            {importing ? 'Importing…' : 'Upload CSV'}
          </Button>
        </div>
        {importStatus && <p className="status-message">{importStatus}</p>}
        {importStats && (
          <div className="import-summary">
            <p className="muted-label">Summary</p>
            <p>Articles imported: {importStats.importedArticles}</p>
            <p>Highlights imported: {importStats.importedHighlights}</p>
            <p>Rows skipped: {importStats.skippedRows}</p>
            <p>Parse errors: {importStats.parseErrors}</p>
          </div>
        )}
      </Card>

      <Card className="settings-card">
        <h2>Export</h2>
        <p className="muted">
          Export notebooks or concepts as markdown directly from Think → Notebook or Think → Concepts.
        </p>
      </Card>

      <Card className="settings-card">
        <h2>Sharing</h2>
        <p className="muted">Make a concept public and share a read-only link.</p>
      </Card>
    </Page>
  );
};

export default Integrations;
