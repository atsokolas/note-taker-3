import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const tz = () => new Date().getTimezoneOffset();

export const getReadingRoom = async () =>
  (await api.get(`/api/library/reading-room?tz=${tz()}`, getAuthHeaders())).data;

export const getWorthSayingPhrasing = async () =>
  (await api.get(`/api/library/reading-room/said?tz=${tz()}`, getAuthHeaders())).data?.said || null;

const explainPath = (articleId) => `/api/articles/${encodeURIComponent(articleId)}/explain-back`;

export const canExplainBack = async (articleId) =>
  Boolean((await api.get(explainPath(articleId), getAuthHeaders())).data?.available);

export const explainBack = async (articleId, text) =>
  (await api.post(explainPath(articleId), { text }, getAuthHeaders())).data;
