import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

// Where an agent's pencil runs against a view the reader holds, or another agent's.
export const listDisagreements = async () => (await api.get('/api/disagreements', getAuthHeaders())).data.disagreements;
export const settleDisagreement = async id => api.post(`/api/disagreements/${id}/settle`, {}, getAuthHeaders());
