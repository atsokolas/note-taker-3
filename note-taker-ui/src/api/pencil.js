import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/* The reader takes up what an agent wrote: a note, an article (and its
   highlights), or one highlight. */
export const inkPencil = async ({ kind, id, highlightId }) => {
  await api.post('/api/ink', { kind, id, ...(highlightId ? { highlightId } : {}) }, getAuthHeaders());
};
