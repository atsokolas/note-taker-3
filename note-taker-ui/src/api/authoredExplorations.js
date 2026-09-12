import api from '../api';

export const authoredWorkError = (error, fallback = 'Your words are here. Saving could not finish.') => (
  error?.response?.data?.error || (!error?.isAxiosError && error?.message) || fallback
);

const pagePath = (pageId) => `/api/wiki/pages/${encodeURIComponent(pageId)}/explorations`;
const claimPath = (pageId, claimId) => (
  `/api/wiki/pages/${encodeURIComponent(pageId)}/claims/${encodeURIComponent(claimId)}/exploration`
);

const explorationApi = (collectionPath, itemPath) => ({
  async load(scopeId) {
    const { data } = await api.get(collectionPath(scopeId));
    return data;
  },
  async save(scopeId, itemId, payload) {
    const { data } = await api.put(itemPath(scopeId, itemId), payload);
    return data.exploration;
  },
  async keep(scopeId, itemId, payload) {
    const { data } = await api.post(`${itemPath(scopeId, itemId)}/keep`, payload);
    return data;
  },
  async discard(scopeId, itemId, expectedRevision) {
    await api.delete(itemPath(scopeId, itemId), { data: { expectedRevision } });
  }
});

export const libraryExplorations = explorationApi(
  articleId => `/api/library/articles/${encodeURIComponent(articleId)}/explorations`,
  (articleId, highlightId) => `/api/library/articles/${encodeURIComponent(articleId)}/highlights/${encodeURIComponent(highlightId)}/exploration`
);

export const authoredExplorations = {
  ...explorationApi(pagePath, claimPath),
  async read(workId) {
    const { data } = await api.get(`/api/authored-explorations/${encodeURIComponent(workId)}`);
    return data;
  },
  async saveVersion(workId, expectedRevision) {
    const { data } = await api.post(`/api/authored-explorations/${encodeURIComponent(workId)}/versions`, { expectedRevision });
    return data.versions;
  },
  async search(query, { signal } = {}) {
    const { data } = await api.get('/api/authored-work/search', { params: { q: query }, signal });
    return data;
  },
  async list() {
    const { data } = await api.get('/api/authored-explorations');
    return data.explorations;
  },
  async disposeSourceCorrection(workId, { eventId, action }) {
    const { data } = await api.post(
      `/api/authored-explorations/${encodeURIComponent(workId)}/source-correction`,
      { eventId, action }
    );
    return data;
  }
};

export default authoredExplorations;
