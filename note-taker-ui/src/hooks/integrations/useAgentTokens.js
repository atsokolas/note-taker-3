import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAgentToken,
  deleteAgentToken,
  listAgentTokenActions,
  listAgentTokens,
  revokeAgentToken,
  undoAgentTokenAction
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
  const [expandedTokenId, setExpandedTokenId] = useState('');
  const [tokenActionsById, setTokenActionsById] = useState({});
  const [tokenActionsLoadingId, setTokenActionsLoadingId] = useState('');
  const [tokenActionUndoId, setTokenActionUndoId] = useState('');
  const [tokenActionsError, setTokenActionsError] = useState('');

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

  const loadTokenActions = useCallback(async (tokenId, { force = false } = {}) => {
    const safeId = String(tokenId || '').trim();
    if (!safeId || (!force && tokenActionsById[safeId])) return;
    setTokenActionsLoadingId(safeId);
    setTokenActionsError('');
    try {
      const response = await listAgentTokenActions(safeId, { limit: 50 });
      setTokenActionsById((current) => ({
        ...current,
        [safeId]: {
          actions: Array.isArray(response?.actions) ? response.actions : [],
          counts: response?.counts || { today: 0, week: 0 }
        }
      }));
    } catch (error) {
      setTokenActionsError(error?.response?.data?.error || 'Failed to load token activity.');
    } finally {
      setTokenActionsLoadingId('');
    }
  }, [tokenActionsById]);

  const handleToggleTokenActivity = useCallback(async (tokenId) => {
    const safeId = String(tokenId || '').trim();
    if (!safeId) return;
    if (expandedTokenId === safeId) {
      setExpandedTokenId('');
      return;
    }
    setExpandedTokenId(safeId);
    await loadTokenActions(safeId);
  }, [expandedTokenId, loadTokenActions]);

  const handleUndoTokenAction = useCallback(async (tokenId, action) => {
    const safeId = String(tokenId || '').trim();
    const actionId = String(action?.id || action?._id || action?.undoPath || '').trim();
    if (!safeId || !actionId || tokenActionUndoId) return;
    setTokenActionUndoId(actionId);
    setTokenActionsError('');
    try {
      await undoAgentTokenAction(action);
      await loadTokenActions(safeId, { force: true });
    } catch (error) {
      setTokenActionsError(error?.response?.data?.error || error?.message || 'Failed to undo agent action.');
    } finally {
      setTokenActionUndoId('');
    }
  }, [loadTokenActions, tokenActionUndoId]);

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
    expandedTokenId,
    tokenActionsById,
    tokenActionsLoadingId,
    tokenActionUndoId,
    tokenActionsError,
    handleCreateToken,
    handleRevokeToken,
    handleDeleteToken,
    handleToggleTokenActivity,
    handleUndoTokenAction,
    loadTokenActions
  };
};

export default useAgentTokens;
