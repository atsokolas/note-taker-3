import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { validateLoopStatusEnvelope } from '../system/noeisLoopModel';

export const getSystemLoops = async () => {
  const response = await api.get('/api/system/loops', getAuthHeaders());
  return validateLoopStatusEnvelope(response.data);
};

export default getSystemLoops;
