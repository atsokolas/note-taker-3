import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const getEmbeddingJobStatus = async () => {
  const response = await api.get('/api/ai/embedding-jobs/status', getAuthHeaders());
  return response.data || null;
};
