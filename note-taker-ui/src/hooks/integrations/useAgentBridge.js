import { useCallback, useState } from 'react';
import api from '../../api';
import { createAgentBridgeToken, getAgentBridgeManifest } from '../../api/agent';
import useProtocolApprovals from '../useProtocolApprovals';

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
  if (bridgeActorType === 'native_agent') return 'Native agent';
  if (bridgeActorType === 'byo_agent') return 'BYO agent';
  return 'User bridge';
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
    scope: String(bridgeScope || 'agent_ops').trim() || 'agent_ops',
    expires_in_sec: Number(expiresInSec) || 1800,
    headers: {
      Authorization: `Bearer ${bridgeToken}`
    }
  }, null, 2);
};

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
  const [bridgeCopyStatus, setBridgeCopyStatus] = useState('');
  const [bridgeMeta, setBridgeMeta] = useState({
    actor: null,
    scope: 'agent_ops',
    expiresInSec: 1800
  });
  const approvalsModel = useProtocolApprovals({ initialStatus: 'pending', limit: 20, autoLoad: true });

  const handleCreateBridgeToken = useCallback(async () => {
    setBridgeBusy(true);
    setBridgeError('');
    setBridgeToken('');
    setBridgeManifest(null);
    setBridgeManifestLoading(false);
    setBridgeManifestError('');
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
        expiresInSec: Number(response?.expiresInSec || payload.ttlSeconds || 1800) || 1800
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
    } catch (error) {
      setBridgeManifest(null);
      setBridgeManifestError(error.response?.data?.error || 'Failed to verify bridge manifest.');
    } finally {
      setBridgeManifestLoading(false);
    }
  }, [bridgeToken]);

  const handleCopyBridgeConfig = useCallback(async (selectedAgentName = '') => {
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
      await navigator.clipboard.writeText(buildOpenClawConfig({
        bridgeToken: safeBridgeToken,
        bridgeScope,
        bridgeActorType,
        selectedAgentName,
        expiresInSec: bridgeMeta?.expiresInSec || bridgeTtl
      }));
      setBridgeCopyStatus('OpenClaw config copied to clipboard.');
    } catch (_error) {
      setBridgeCopyStatus('Failed to copy OpenClaw config.');
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
    bridgeCopyStatus,
    bridgeMeta,
    protocolApprovals: approvalsModel.protocolApprovals,
    protocolApprovalsLoading: approvalsModel.protocolApprovalsLoading,
    protocolApprovalsError: approvalsModel.protocolApprovalsError,
    protocolApprovalBusyId: approvalsModel.protocolApprovalBusyId,
    handleCreateBridgeToken,
    handleTestBridgeConnection,
    handleCopyBridgeConfig,
    loadProtocolApprovals: approvalsModel.loadProtocolApprovals,
    handleApproveProtocolApproval: approvalsModel.handleApproveProtocolApproval,
    handleRejectProtocolApproval: approvalsModel.handleRejectProtocolApproval
  };
};

export default useAgentBridge;
