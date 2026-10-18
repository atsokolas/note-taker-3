import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const startLibraryFilingSuggestions = async (options = {}) => {
  const payload = {};
  if (options.resumeExisting) payload.resumeExisting = true;
  const res = await api.post('/api/library/filing-suggestions', payload, getAuthHeaders());
  return res.data || {};
};

/* Everything read, laid out by subject. A quiet library answers
   `status: 'quiet'` and nothing to draw. */
export const getReadingMap = async () => {
  const res = await api.get('/api/library/map', getAuthHeaders());
  return res.data || { status: 'quiet', sources: [], clusters: [], gaps: [] };
};
