import { useCallback, useState } from 'react';
import api from '../../api';
import { createAgentBridgeToken, executeAgentBridgeMcp, getAgentBridgeManifest } from '../../api/agent';
import { AGENT_DISPLAY_NAME, SPECIALIST_AGENT_LABEL, USER_BRIDGE_LABEL } from '../../constants/agentIdentity';
import useProtocolApprovals from '../useProtocolApprovals';

const BRIDGE_HEALTH_STORAGE_KEY = 'noeis:agent-bridge:last-health';

const readStoredBridgeHealth = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BRIDGE_HEALTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
};

const writeStoredBridgeHealth = (value) => {
  if (typeof window === 'undefined') return;
  try {
    if (!value) {
      window.localStorage.removeItem(BRIDGE_HEALTH_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(BRIDGE_HEALTH_STORAGE_KEY, JSON.stringify(value));
  } catch (_error) {
    // Local storage is a convenience cache; bridge auth still lives in the token.
  }
};

const resolveBridgeBaseUrl = () => {
  const configured = String(process.env.REACT_APP_API_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  const apiBase = String(api.defaults?.baseURL || '').trim();
  if (apiBase) return apiBase.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/$/, '');
  }
  return 'http://localhost:5500';
};

const formatActorLabel = (bridgeActorType = 'user', selectedAgentName = '') => {
  if (bridgeActorType === 'byo_agent' && selectedAgentName) return selectedAgentName;
  if (bridgeActorType === 'native_agent') return AGENT_DISPLAY_NAME;
  if (bridgeActorType === 'byo_agent') return SPECIALIST_AGENT_LABEL;
  return USER_BRIDGE_LABEL;
};

const buildOpenClawConfig = ({
  bridgeToken,
  bridgeScope,
  bridgeActorType,
  selectedAgentName,
  expiresInSec = 1800
}) => {
  const baseUrl = resolveBridgeBaseUrl();
  return JSON.stringify({
    name: formatActorLabel(bridgeActorType, selectedAgentName),
    protocol: 'note-taker-agent-bridge-v1',
    manifest_url: `${baseUrl}/api/agent/protocol/bridge/manifest`,
    a2a_url: `${baseUrl}/api/agent/protocol/bridge/a2a`,
    mcp_url: `${baseUrl}/api/agent/protocol/bridge/mcp`,
    access_check_method: 'bridge/access_check',
    project_search_method: 'project/search',
    project_read_method: 'project/read',
    project_write_draft_method: 'project/write_draft',
    scope: String(bridgeScope || 'agent_ops').trim() || 'agent_ops',
    expires_in_sec: Number(expiresInSec) || 1800,
    headers: {
      Authorization: `Bearer ${bridgeToken}`
    }
  }, null, 2);
};

const buildHermesConfig = ({
  bridgeToken,
  bridgeScope,
  bridgeActorType,
  selectedAgentName,
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
          name: formatActorLabel(bridgeActorType, selectedAgentName),
          protocol: 'note-taker-agent-bridge-v1',
          manifest_url: `${baseUrl}/api/agent/protocol/bridge/manifest`,
          scope: String(bridgeScope || 'agent_ops').trim() || 'agent_ops',
          expires_in_sec: Number(expiresInSec) || 1800,
          methods: {
            access_check: 'bridge/access_check',
            project_search: 'project/search',
            project_read: 'project/read',
            project_write_draft: 'project/write_draft'
          }
        }
      }
    }
  }, null, 2);
};

const buildBridgeRuntimeConfig = ({
  runtime = 'openclaw',
  bridgeToken,
  bridgeScope,
  bridgeActorType,
  selectedAgentName,
  expiresInSec
}) => (
  runtime === 'hermes'
    ? buildHermesConfig({ bridgeToken, bridgeScope, bridgeActorType, selectedAgentName, expiresInSec })
    : buildOpenClawConfig({ bridgeToken, bridgeScope, bridgeActorType, selectedAgentName, expiresInSec })
);

const useAgentBridge = () => {
  const [bridgeActorType, setBridgeActorType] = useState('user');
  const [bridgeActorId, setBridgeActorId] = useState('');
  const [bridgeScope, setBridgeScope] = useState('agent_ops');
  const [bridgeTtl, setBridgeTtl] = useState(1800);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const [bridgeToken, setBridgeToken] = useState('');
  const [bridgeManifestLoading, setBridgeManifestLoading] = useState(false);
  const [bridgeManifestError, setBridgeManifestError] = useState('');
  const [bridgeManifest, setBridgeManifest] = useState(null);
  const [bridgeHealth, setBridgeHealth] = useState(() => readStoredBridgeHealth());
  const [bridgeAccessCheckLoading, setBridgeAccessCheckLoading] = useState(false);
  const [bridgeAccessCheckError, setBridgeAccessCheckError] = useState('');
  const [bridgeCopyStatus, setBridgeCopyStatus] = useState('');
  const [bridgeMeta, setBridgeMeta] = useState({
    actor: null,
    scope: 'agent_ops',
    expiresInSec: 1800,
    expiresAt: null
  });
  const approvalsModel = useProtocolApprovals({ initialStatus: 'pending', limit: 20, autoLoad: true });

  const handleCreateBridgeToken = useCallback(async () => {
    setBridgeBusy(true);
    setBridgeError('');
    setBridgeToken('');
    setBridgeManifest(null);
    setBridgeManifestLoading(false);
    setBridgeManifestError('');
    setBridgeAccessCheckError('');
    setBridgeCopyStatus('');
    try {
      const payload = {
        actorType: bridgeActorType,
        actorId: bridgeActorType === 'byo_agent' ? String(bridgeActorId || '').trim() : '',
        scope: String(bridgeScope || 'agent_ops').trim() || 'agent_ops',
        ttlSeconds: Number(bridgeTtl) || 1800
      };
      const response = await createAgentBridgeToken(payload);
      setBridgeToken(String(response?.bridgeToken || '').trim());
      setBridgeMeta({
        actor: response?.actor || null,
        scope: String(response?.scope || payload.scope).trim() || 'agent_ops',
        expiresInSec: Number(response?.expiresInSec || payload.ttlSeconds || 1800) || 1800,
        expiresAt: new Date(Date.now() + ((Number(response?.expiresInSec || payload.ttlSeconds || 1800) || 1800) * 1000)).toISOString()
      });
    } catch (error) {
      setBridgeError(error.response?.data?.error || 'Failed to create bridge token.');
    } finally {
      setBridgeBusy(false);
    }
  }, [bridgeActorId, bridgeActorType, bridgeScope, bridgeTtl]);

  const handleTestBridgeConnection = useCallback(async () => {
    const safeBridgeToken = String(bridgeToken || '').trim();
    if (!safeBridgeToken) {
      setBridgeManifestError('Mint a bridge token before testing the connection.');
      return;
    }
    setBridgeManifestLoading(true);
    setBridgeManifestError('');
    try {
      const manifest = await getAgentBridgeManifest(safeBridgeToken);
      setBridgeManifest(manifest || null);
      const nextHealth = {
        status: 'manifest_verified',
        runtime: '',
        actor: manifest?.actor || bridgeMeta.actor || null,
        scope: String(manifest?.scope || bridgeMeta.scope || bridgeScope || 'agent_ops').trim() || 'agent_ops',
        capabilities: manifest?.capabilities || {},
        access: manifest?.access || null,
        lastVerifiedAt: new Date().toISOString(),
        expiresAt: bridgeMeta.expiresAt || null,
        error: ''
      };
      setBridgeHealth(nextHealth);
      writeStoredBridgeHealth(nextHealth);
    } catch (error) {
      setBridgeManifest(null);
      setBridgeManifestError(error.response?.data?.error || 'Failed to verify bridge manifest.');
    } finally {
      setBridgeManifestLoading(false);
    }
  }, [bridgeMeta.actor, bridgeMeta.expiresAt, bridgeMeta.scope, bridgeScope, bridgeToken]);

  const handleRunBridgeAccessCheck = useCallback(async (runtime = 'openclaw') => {
    const safeBridgeToken = String(bridgeToken || '').trim();
    if (!safeBridgeToken) {
      setBridgeAccessCheckError('Mint a bridge token before running the access check.');
      return;
    }
    setBridgeAccessCheckLoading(true);
    setBridgeAccessCheckError('');
    try {
      const response = await executeAgentBridgeMcp(safeBridgeToken, {
        id: `access-check-${Date.now()}`,
        method: 'bridge/access_check',
        params: {
          query: '',
          limit: 5
        }
      });
      if (response?.error) {
        throw new Error(response.error.message || 'Bridge access check failed.');
      }
      const result = response?.result || {};
      const safeRuntime = runtime === 'hermes' ? 'hermes' : 'openclaw';
      const nextHealth = {
        status: 'access_verified',
        runtime: safeRuntime,
        actor: result.actor || bridgeMeta.actor || null,
        scope: String(result.scope || bridgeMeta.scope || bridgeScope || 'agent_ops').trim() || 'agent_ops',
        capabilities: bridgeManifest?.capabilities || {},
        access: result.access || bridgeManifest?.access || null,
        checks: result.checks || {},
        sampleResults: Array.isArray(result.sampleResults) ? result.sampleResults : [],
        lastVerifiedAt: new Date().toISOString(),
        expiresAt: bridgeMeta.expiresAt || null,
        error: ''
      };
      setBridgeHealth(nextHealth);
      writeStoredBridgeHealth(nextHealth);
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Failed to run bridge access check.';
      setBridgeAccessCheckError(message);
      const failedHealth = {
        ...(bridgeHealth || {}),
        status: 'error',
        runtime: runtime === 'hermes' ? 'hermes' : 'openclaw',
        lastVerifiedAt: new Date().toISOString(),
        expiresAt: bridgeMeta.expiresAt || bridgeHealth?.expiresAt || null,
        error: message
      };
      setBridgeHealth(failedHealth);
      writeStoredBridgeHealth(failedHealth);
    } finally {
      setBridgeAccessCheckLoading(false);
    }
  }, [bridgeHealth, bridgeManifest?.access, bridgeManifest?.capabilities, bridgeMeta.actor, bridgeMeta.expiresAt, bridgeMeta.scope, bridgeScope, bridgeToken]);

  const handleForgetBridgeHealth = useCallback(() => {
    setBridgeHealth(null);
    setBridgeManifest(null);
    setBridgeManifestError('');
    setBridgeAccessCheckError('');
    setBridgeCopyStatus('');
    writeStoredBridgeHealth(null);
  }, []);

  const handleCopyBridgeConfig = useCallback(async (selectedAgentName = '', runtime = 'openclaw') => {
    const safeBridgeToken = String(bridgeToken || '').trim();
    if (!safeBridgeToken) {
      setBridgeCopyStatus('Mint a bridge token before copying config.');
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setBridgeCopyStatus('Clipboard access is not available in this browser.');
      return;
    }
    try {
      const safeRuntime = runtime === 'hermes' ? 'hermes' : 'openclaw';
      await navigator.clipboard.writeText(buildBridgeRuntimeConfig({
        runtime: safeRuntime,
        bridgeToken: safeBridgeToken,
        bridgeScope,
        bridgeActorType,
        selectedAgentName,
        expiresInSec: bridgeMeta?.expiresInSec || bridgeTtl
      }));
      setBridgeCopyStatus(`${safeRuntime === 'hermes' ? 'Hermes' : 'OpenClaw'} config copied to clipboard.`);
    } catch (_error) {
      setBridgeCopyStatus('Failed to copy bridge config.');
    }
  }, [bridgeActorType, bridgeMeta?.expiresInSec, bridgeScope, bridgeToken, bridgeTtl]);

  return {
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
    bridgeHealth,
    bridgeAccessCheckLoading,
    bridgeAccessCheckError,
    bridgeCopyStatus,
    bridgeMeta,
    protocolApprovals: approvalsModel.protocolApprovals,
    protocolApprovalsLoading: approvalsModel.protocolApprovalsLoading,
    protocolApprovalsError: approvalsModel.protocolApprovalsError,
    protocolApprovalBusyId: approvalsModel.protocolApprovalBusyId,
    handleCreateBridgeToken,
    handleTestBridgeConnection,
    handleRunBridgeAccessCheck,
    handleForgetBridgeHealth,
    handleCopyBridgeConfig,
    loadProtocolApprovals: approvalsModel.loadProtocolApprovals,
    handleApproveProtocolApproval: approvalsModel.handleApproveProtocolApproval,
    handleRejectProtocolApproval: approvalsModel.handleRejectProtocolApproval
  };
};

export default useAgentBridge;
