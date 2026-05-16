import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAgentToken,
  deleteAgentToken,
  listAgentTokens,
  revokeAgentToken
} from '../../api/agent';

const useAgentTokens = () => {
  const [tokens, setTokens] = useState([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokensError, setTokensError] = useState('');
  const [tokenLabel, setTokenLabel] = useState('');
  const [tokenScopes, setTokenScopes] = useState(['read']);
  const [tokenDailyQuota, setTokenDailyQuota] = useState('');
  const [tokenExpiresAt, setTokenExpiresAt] = useState('');
  const [creatingToken, setCreatingToken] = useState(false);
  const [tokenBusyId, setTokenBusyId] = useState('');
  const [issuedToken, setIssuedToken] = useState(null);
  const [issuedSecret, setIssuedSecret] = useState('');

  const loadTokens = useCallback(async () => {
    setTokensLoading(true);
    setTokensError('');
    try {
      const response = await listAgentTokens();
      setTokens(Array.isArray(response?.tokens) ? response.tokens : []);
    } catch (error) {
      setTokens([]);
      setTokensError(error?.response?.data?.error || 'Failed to load agent tokens.');
    } finally {
      setTokensLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const sortedTokens = useMemo(() => (
    [...tokens].sort((a, b) => {
      const aTime = new Date(a?.createdAt || a?.updatedAt || 0).getTime();
      const bTime = new Date(b?.createdAt || b?.updatedAt || 0).getTime();
      return bTime - aTime;
    })
  ), [tokens]);

  const handleCreateToken = useCallback(async () => {
    if (creatingToken) return;
    setCreatingToken(true);
    setTokensError('');
    setIssuedToken(null);
    setIssuedSecret('');
    try {
      const label = String(tokenLabel || '').trim();
      if (!label) {
        setTokensError('Token label is required.');
        setCreatingToken(false);
        return;
      }
      const scopes = Array.isArray(tokenScopes) && tokenScopes.length > 0 ? tokenScopes : ['read'];
      const payload = {
        label,
        scopes
      };
      if (tokenDailyQuota !== '') payload.dailyQuota = Number(tokenDailyQuota);
      if (tokenExpiresAt) payload.expiresAt = tokenExpiresAt;
      const response = await createAgentToken(payload);
      setIssuedToken(response?.token || null);
      setIssuedSecret(String(response?.secret || '').trim());
      setTokenLabel('');
      setTokenScopes(['read']);
      setTokenDailyQuota('');
      setTokenExpiresAt('');
      await loadTokens();
    } catch (error) {
      setTokensError(error?.response?.data?.error || 'Failed to issue agent token.');
    } finally {
      setCreatingToken(false);
    }
  }, [creatingToken, loadTokens, tokenDailyQuota, tokenExpiresAt, tokenLabel, tokenScopes]);

  const handleScopeChange = useCallback((scope, enabled) => {
    const safeScope = String(scope || '').trim();
    if (!safeScope) return;
    setTokenScopes((current) => {
      const next = new Set(Array.isArray(current) ? current : []);
      if (enabled) next.add(safeScope);
      else next.delete(safeScope);
      return Array.from(next);
    });
  }, []);

  const handleRevokeToken = useCallback(async (tokenId) => {
    const safeId = String(tokenId || '').trim();
    if (!safeId || tokenBusyId) return;
    setTokenBusyId(safeId);
    setTokensError('');
    try {
      await revokeAgentToken(safeId);
      await loadTokens();
    } catch (error) {
      setTokensError(error?.response?.data?.error || 'Failed to revoke agent token.');
    } finally {
      setTokenBusyId('');
    }
  }, [loadTokens, tokenBusyId]);

  const handleDeleteToken = useCallback(async (tokenId) => {
    const safeId = String(tokenId || '').trim();
    if (!safeId || tokenBusyId) return;
    setTokenBusyId(safeId);
    setTokensError('');
    try {
      await deleteAgentToken(safeId);
      await loadTokens();
    } catch (error) {
      setTokensError(error?.response?.data?.error || 'Failed to delete agent token.');
    } finally {
      setTokenBusyId('');
    }
  }, [loadTokens, tokenBusyId]);

  return {
    tokens,
    sortedTokens,
    tokensLoading,
    tokensError,
    tokenLabel,
    setTokenLabel,
    tokenScopes,
    handleScopeChange,
    tokenDailyQuota,
    setTokenDailyQuota,
    tokenExpiresAt,
    setTokenExpiresAt,
    creatingToken,
    tokenBusyId,
    issuedToken,
    issuedSecret,
    handleCreateToken,
    handleRevokeToken,
    handleDeleteToken
  };
};

export default useAgentTokens;
