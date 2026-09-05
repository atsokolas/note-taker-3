import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/**
 * The papers your agents maintain for you.
 *
 * Noeis does not write these. Whichever agent you already use — Claude,
 * Codex, Cursor, OpenClaw, Hermes — files them through the wiki MCP, and this
 * is the reader's side of that door.
 */

export const listEditions = async ({ profile = '', limit } = {}) => {
  const params = new URLSearchParams();
  if (profile) params.set('profile', profile);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  const res = await api.get(`/api/editions${query ? `?${query}` : ''}`, getAuthHeaders());
  return Array.isArray(res.data?.editions) ? res.data.editions : [];
};

export const getEdition = async (id) => {
  const res = await api.get(`/api/editions/${encodeURIComponent(id)}`, getAuthHeaders());
  return res.data || null;
};

/** The crossing: an agent's source becomes a row in your own library. */
export const saveEditionItem = async (editionId, itemId) => {
  const res = await api.post(
    `/api/editions/${encodeURIComponent(editionId)}/items/${encodeURIComponent(itemId)}/save`,
    {},
    getAuthHeaders()
  );
  return res.data || null;
};

export const removeEdition = async (id) => {
  const res = await api.delete(`/api/editions/${encodeURIComponent(id)}`, getAuthHeaders());
  return res.data || null;
};

/** A paper someone published, read by a stranger. No auth: that is the point. */
export const getPublicEdition = async (slug) => {
  const res = await api.get(`/api/public/editions/${encodeURIComponent(slug)}`);
  return res.data || null;
};

export const getEditionShare = async (id) => {
  const res = await api.get(`/api/editions/${encodeURIComponent(id)}/share`, getAuthHeaders());
  return res.data || { shared: false };
};

export const shareEdition = async (id) => {
  const res = await api.post(`/api/editions/${encodeURIComponent(id)}/share`, {}, getAuthHeaders());
  return res.data || {};
};

export const revokeEditionShare = async (id) => {
  const res = await api.delete(`/api/editions/${encodeURIComponent(id)}/share`, getAuthHeaders());
  return res.data || { revoked: true };
};
