import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/* The reader takes up what an agent wrote: a note, an article (and its
   highlights), or one highlight. */
export const inkPencil = async ({ kind, id, highlightId }) => {
  await api.post('/api/ink', { kind, id, ...(highlightId ? { highlightId } : {}) }, getAuthHeaders());
};

// Everything still in pencil, newest first.
export const listPencil = async () => (await api.get('/api/pencil', getAuthHeaders())).data.pencil;

/* The reader strikes what an agent wrote, saying why if they like: it is
   taken out, or a note it rewrote goes back to the reader's version. */
export const strikePencil = async ({ kind, id, highlightId, why }) => (
  await api.post('/api/strike', { kind, id, ...(highlightId ? { highlightId } : {}), why }, getAuthHeaders())
).data.struck;

// What agents learn from the reader's verdicts: how much they keep, and lately why.
export const getTaste = async () => (await api.get('/api/taste', getAuthHeaders())).data;
