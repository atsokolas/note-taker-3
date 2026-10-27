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

/* A year of passages set as a book. With no year, the latest year marked. */
export const getCommonplaceBook = async (year) => {
  const res = await api.get('/api/library/book', { ...getAuthHeaders(), params: year ? { year } : {} });
  return res.data;
};
