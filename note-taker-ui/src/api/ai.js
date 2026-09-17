import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const getEmbeddingJobStatus = async () => {
  const response = await api.get('/api/ai/embedding-jobs/status', getAuthHeaders());
  return response.data || null;
};

export const retryEmbeddingJob = async (jobId) => {
  const safeId = encodeURIComponent(String(jobId || '').trim());
  if (!safeId) throw new Error('Search job id is required.');
  const response = await api.post(`/api/ai/embedding-jobs/${safeId}/retry`, {}, getAuthHeaders());
  return response.data || null;
};
