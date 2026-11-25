import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { today } from './imports';

// Read with the reader's own day, so what came back turns over at their midnight.
export const readHome = async () => (await api.get(`/api/home?today=${today()}`, getAuthHeaders())).data;

export const keepPassage = async ({ articleId, highlightId }, kept = true) => (
  (await api.patch(`/articles/${encodeURIComponent(articleId)}/highlights/${encodeURIComponent(highlightId)}/kept`, { kept }, getAuthHeaders())).data
);
export const readThread = async threadId => (await api.get(`/api/threads/${encodeURIComponent(threadId)}`, getAuthHeaders())).data;
// Kept, not yet, or not a thing: only the reader answers a thread.
export const answerThread = async (threadId, answer) => (
  (await api.patch(`/api/threads/${encodeURIComponent(threadId)}`, { answer }, getAuthHeaders())).data
);
