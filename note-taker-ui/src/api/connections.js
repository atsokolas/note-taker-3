import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { getStoredAuthScope } from '../system/authScopedSnapshotCache';
import { clearCachedPrefix, fetchWithCache } from '../utils/cache';

const CONNECTION_CACHE_TTL_MS = 30_000;
const CONNECTION_CACHE_PREFIX = 'connections:item:';
let connectionCacheGeneration = 0;

const clearConnectionCache = () => {
  connectionCacheGeneration += 1;
  clearCachedPrefix(CONNECTION_CACHE_PREFIX);
};

export const createConnection = async (payload) => {
  const res = await api.post('/api/connections', payload, getAuthHeaders());
  clearConnectionCache();
  return res.data;
};

export const getConnectionsForItem = async ({
  itemType,
  itemId,
  scopeType = '',
  scopeId = '',
  force = false
}) => {
  const params = new URLSearchParams();
  params.set('itemType', itemType);
  params.set('itemId', itemId);
  if (scopeType) params.set('scopeType', scopeType);
  if (scopeId) params.set('scopeId', scopeId);
  const path = `/api/connections?${params.toString()}`;
  const cacheKey = `${CONNECTION_CACHE_PREFIX}${connectionCacheGeneration}:${getStoredAuthScope()}:${path}`;
  return fetchWithCache(
    cacheKey,
    async () => {
      const res = await api.get(path, getAuthHeaders());
      return res.data || { outgoing: [], incoming: [] };
    },
    { ttlMs: CONNECTION_CACHE_TTL_MS, force: Boolean(force) }
  );
};

export const deleteConnection = async (id) => {
  const res = await api.delete(`/api/connections/${id}`, getAuthHeaders());
  clearConnectionCache();
  return res.data;
};

export const searchConnectableItems = async ({
  q = '',
  excludeType = '',
  excludeId = '',
  limit = 15,
  itemTypes = [],
  scopeType = '',
  scopeId = ''
} = {}) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (excludeType) params.set('excludeType', excludeType);
  if (excludeId) params.set('excludeId', excludeId);
  if (Array.isArray(itemTypes) && itemTypes.length > 0) {
    params.set('itemTypes', itemTypes.join(','));
  }
  if (scopeType) params.set('scopeType', scopeType);
  if (scopeId) params.set('scopeId', scopeId);
  params.set('limit', String(limit));
  const res = await api.get(`/api/connections/search?${params.toString()}`, getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

export const getConnectionsForScope = async ({ scopeType, scopeId, limit = 40 }) => {
  const params = new URLSearchParams();
  params.set('scopeType', scopeType);
  params.set('scopeId', scopeId);
  params.set('limit', String(limit));
  const res = await api.get(`/api/connections/scope?${params.toString()}`, getAuthHeaders());
  return res.data || { connections: [] };
};
