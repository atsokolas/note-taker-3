import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const startLibraryFilingSuggestions = async (options = {}) => {
  const payload = {};
  if (options.resumeExisting) payload.resumeExisting = true;
  const res = await api.post('/api/library/filing-suggestions', payload, getAuthHeaders());
  return res.data || {};
};
