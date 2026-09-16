import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
export const getLibraryCollection = async (options = {}) => {
  const params = new URLSearchParams(
    Object.entries(options).filter(([, value]) => value !== '' && value != null)
  );
  return (await api.get(`/api/library/collection?${params}`, getAuthHeaders()))
    .data;
};
export const getLibraryPeek = async (id) =>
  (await api.get(`/articles/${encodeURIComponent(id)}`, getAuthHeaders())).data;
