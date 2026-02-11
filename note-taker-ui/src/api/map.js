import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const fetchGraphData = async ({
  limit = 180,
  offset = 0,
  relationTypes = [],
  itemTypes = [],
  tags = [],
  scopeType = '',
  scopeId = '',
  notebookId = ''
} = {}) => {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (Array.isArray(relationTypes) && relationTypes.length > 0) {
    params.set('relationTypes', relationTypes.join(','));
  }
  if (Array.isArray(itemTypes) && itemTypes.length > 0) {
    params.set('itemTypes', itemTypes.join(','));
  }
  if (Array.isArray(tags) && tags.length > 0) {
    params.set('tags', tags.join(','));
  }
  if (scopeType) params.set('scopeType', scopeType);
  if (scopeId) params.set('scopeId', scopeId);
  if (notebookId) params.set('notebookId', notebookId);
  const res = await api.get(`/api/map/graph?${params.toString()}`, getAuthHeaders());
  return res.data || { nodes: [], edges: [], page: { limit, offset, hasMore: false, nextOffset: offset } };
};
