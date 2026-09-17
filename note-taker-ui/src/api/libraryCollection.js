import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
export const getLibraryCollection = async (options = {}) => {
  const params = new URLSearchParams(
    Object.entries(options).filter(([, value]) => value !== '' && value != null)
  );
  return (await api.get(`/api/library/collection?${params}`, getAuthHeaders()))
    .data;
};
export const getLibraryCollectionTraces = async (ids = []) => {
  const articleIds = [...new Set(ids.map(id => String(id || '').trim()).filter(Boolean))];
  if (!articleIds.length) return [];
  return (await api.get(
    `/api/library/collection/traces?ids=${encodeURIComponent(articleIds.join(','))}`,
    getAuthHeaders()
  )).data?.traces || [];
};
export const getLibraryPeek = async (id) =>
  (await api.get(`/articles/${encodeURIComponent(id)}`, getAuthHeaders())).data;
