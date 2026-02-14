import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const getBoardForScope = async (scopeType, scopeId) => {
  const safeType = encodeURIComponent(String(scopeType || '').trim());
  const safeScopeId = encodeURIComponent(String(scopeId || '').trim());
  const res = await api.get(`/api/boards/${safeType}/${safeScopeId}`, getAuthHeaders());
  return res.data || { board: null, items: [] };
};

export const createBoardItem = async (boardId, payload) => {
  const res = await api.post(`/api/boards/${boardId}/items`, payload, getAuthHeaders());
  return res.data;
};

export const updateBoardItems = async (boardId, items = []) => {
  const res = await api.put(`/api/boards/${boardId}/items`, { items }, getAuthHeaders());
  return res.data || { items: [] };
};

export const deleteBoardItem = async (boardId, itemId) => {
  const res = await api.delete(`/api/boards/${boardId}/items/${itemId}`, getAuthHeaders());
  return res.data;
};
