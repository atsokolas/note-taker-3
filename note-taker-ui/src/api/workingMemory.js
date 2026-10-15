import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const createWorkingMemory = async (payload) => {
  const res = await api.post('/api/working-memory', payload, getAuthHeaders());
  return res.data;
};
