import { useCallback, useState } from 'react';
import { createAgentBridgeToken } from '../../api/agent';

const useAgentBridge = () => {
  const [bridgeActorType, setBridgeActorType] = useState('user');
  const [bridgeActorId, setBridgeActorId] = useState('');
  const [bridgeScope, setBridgeScope] = useState('handoff_ops');
  const [bridgeTtl, setBridgeTtl] = useState(1800);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const [bridgeToken, setBridgeToken] = useState('');

  const handleCreateBridgeToken = useCallback(async () => {
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
  }, [bridgeActorId, bridgeActorType, bridgeScope, bridgeTtl]);

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
    handleCreateBridgeToken
  };
};

export default useAgentBridge;
