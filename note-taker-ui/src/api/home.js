import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { today } from './imports';

// Read with the reader's own day, so what came back turns over at their midnight.
export const readHome = async () => (await api.get(`/api/home?today=${today()}`, getAuthHeaders())).data;

export const keepPassage = async ({ articleId, highlightId }, kept = true) => (
  (await api.patch(`/articles/${encodeURIComponent(articleId)}/highlights/${encodeURIComponent(highlightId)}/kept`, { kept }, getAuthHeaders())).data
);
export const readThread = async threadId => (await api.get(`/api/threads/${encodeURIComponent(threadId)}?today=${today()}`, getAuthHeaders())).data;
// What a kept thread offered: it joins only when the reader adds it.
export const growThread = async (threadId, { articleId, highlightId }, joins) => (
  (await api.post(`/api/threads/${encodeURIComponent(threadId)}/offered`, { articleId, highlightId, joins }, getAuthHeaders())).data
);
// Kept, not yet, or not a thing: only the reader answers a thread.
export const answerThread = async (threadId, answer) => (
  (await api.patch(`/api/threads/${encodeURIComponent(threadId)}`, { answer }, getAuthHeaders())).data
);
// Beyond your library: a few pages from the open web, searched only when asked.
export const readWorld = async query => (
  (await api.get(`/api/world?q=${encodeURIComponent(query)}`, getAuthHeaders())).data?.pages || []
);
export const readKept = async () => (await api.get('/api/kept', getAuthHeaders())).data?.kept || [];
// Underneath, by month: an issue made from your own marks.
export const readUnderneathMonths = async () => (await api.get('/api/underneath', getAuthHeaders())).data?.months || [];
export const readUnderneath = async month => (await api.get(`/api/underneath/${encodeURIComponent(month)}`, getAuthHeaders())).data;
