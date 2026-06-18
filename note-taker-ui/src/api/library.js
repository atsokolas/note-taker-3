import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const startLibraryFilingSuggestions = async () => {
  const res = await api.post('/api/library/filing-suggestions', {}, getAuthHeaders());
  return res.data || {};
};
