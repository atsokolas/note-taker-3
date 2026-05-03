import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const WIKI_PAGES_PATH = '/api/wiki/pages';

const safeId = (id) => encodeURIComponent(String(id || '').trim());

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
};

export const listWikiPages = async (params = {}) => {
  const res = await api.get(`${WIKI_PAGES_PATH}${buildQueryString(params)}`, getAuthHeaders());
  return Array.isArray(res.data) ? res.data : [];
};

export const createWikiPage = async (payload = {}) => {
  const res = await api.post(WIKI_PAGES_PATH, payload, getAuthHeaders());
  return res.data;
};

export const getWikiPage = async (id) => {
  const res = await api.get(`${WIKI_PAGES_PATH}/${safeId(id)}`, getAuthHeaders());
  return res.data;
};

export const updateWikiPage = async (id, updates = {}) => {
  const res = await api.patch(`${WIKI_PAGES_PATH}/${safeId(id)}`, updates, getAuthHeaders());
  return res.data;
};

export const archiveWikiPage = async (id) => {
  const res = await api.delete(`${WIKI_PAGES_PATH}/${safeId(id)}`, getAuthHeaders());
  return res.data;
};

export const draftWikiPage = async (id) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/ai/draft`, {}, getAuthHeaders());
  return res.data;
};

export const addWikiSource = async (id, source = {}) => {
  const res = await api.post(`${WIKI_PAGES_PATH}/${safeId(id)}/sources`, source, getAuthHeaders());
  return res.data;
};

export const removeWikiSource = async (id, sourceRefId) => {
  const res = await api.delete(`${WIKI_PAGES_PATH}/${safeId(id)}/sources/${safeId(sourceRefId)}`, getAuthHeaders());
  return res.data;
};

const wikiApi = {
  listWikiPages,
  createWikiPage,
  getWikiPage,
  updateWikiPage,
  archiveWikiPage,
  draftWikiPage,
  addWikiSource,
  removeWikiSource
};

export default wikiApi;
