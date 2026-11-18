import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

// Where agents put something of the reader's to work.
export const usedIn = async id => (await api.get(`/api/cite/${id}`, getAuthHeaders())).data.usedIn;
