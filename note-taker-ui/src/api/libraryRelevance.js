import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { fetchWithCache } from '../utils/cache';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const SOURCE_TYPES = new Set(['article', 'highlight', 'note']);

const isPlainObject = value => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
);

const cacheScopeFor = authHeaders => {
  const authorization = String(authHeaders?.headers?.Authorization || 'anonymous');
  let first = 2166136261;
  let second = 0x9e3779b9;
  for (let index = 0; index < authorization.length; index += 1) {
    const code = authorization.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619) >>> 0;
    second = Math.imul(second ^ (code + index), 2246822519) >>> 0;
  }
  return `${authorization.length}:${first.toString(36)}:${second.toString(36)}`;
};

export const LIBRARY_RELEVANCE_VIEWS = [
  'recent',
  'active',
  'needs_review',
  'unconnected'
];

export const LIBRARY_RELEVANCE_SOURCE_SCOPES = ['articles', 'mixed'];

const requireLibraryPage = (data, { view, sourceScope }) => {
  const mixedPaginationValid = sourceScope !== 'mixed' || (
    typeof data?.hasMore === 'boolean'
    && (data?.nextCursor === null || typeof data?.nextCursor === 'string')
  );
  if (
    !data
    || data.view !== view
    || data.sourceScope !== sourceScope
    || !Array.isArray(data.sources)
    || !isPlainObject(data.counts)
    || !isPlainObject(data.coverage)
    || typeof data.generatedAt !== 'string'
    || !data.generatedAt.trim()
    || !mixedPaginationValid
    || data.sources.some(row => (
      !row?.source
      || !SOURCE_TYPES.has(row.source.type)
      || typeof row.source.id !== 'string'
      || !row.source.id.trim()
      || (
        row.source.type === 'highlight'
        && (typeof row.source.parentId !== 'string' || !row.source.parentId.trim())
      )
    ))
  ) {
    throw new Error('Library relevance response is malformed.');
  }
  return data;
};

const requireLibraryRoom = (data, { view }) => {
  requireLibraryPage(data, { view, sourceScope: 'mixed' });
  if (
    data?.room !== 'library'
    || !isPlainObject(data?.shelves)
    || !Array.isArray(data.shelves.folders)
    || !isPlainObject(data.shelves.counts)
    || ['articles', 'rawArticles', 'unfiledArticles', 'keptArticles', 'laterArticles', 'setAsideArticles', 'suppressedArticles']
      .some(key => !Number.isFinite(data.shelves.counts[key]) || data.shelves.counts[key] < 0)
    || !isPlainObject(data.shelves.piles)
    || !Array.isArray(data.shelves.piles.later)
    || !Array.isArray(data.shelves.piles.setAside)
  ) {
    throw new Error('Library room response is malformed.');
  }
  return data;
};

export const getLibraryRoom = async ({
  view = 'recent',
  limit = 40,
  showSuppressed = false,
  force = false
} = {}) => {
  if (!LIBRARY_RELEVANCE_VIEWS.includes(view)) {
    throw new Error(`Library view must be one of: ${LIBRARY_RELEVANCE_VIEWS.join(', ')}.`);
  }
  const parsedLimit = Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new Error('Library limit must be an integer from 1 to 100.');
  }
  const params = new URLSearchParams({ view, limit: String(parsedLimit) });
  if (showSuppressed) params.set('showSuppressed', '1');
  const path = `/api/library/room?${params.toString()}`;
  const authHeaders = getAuthHeaders();
  const authScope = cacheScopeFor(authHeaders);
  return fetchWithCache(
    `library-room:${authScope}:${path}`,
    async () => {
      const response = await api.get(path, authHeaders);
      return requireLibraryRoom(response.data, { view });
    },
    { ttlMs: 30_000, force: Boolean(force) }
  );
};

export const getLibraryRelevance = async ({
  view = 'recent',
  limit = 40,
  sourceScope = 'mixed',
  showSuppressed = false,
  cursor = '',
  force = false
} = {}) => {
  if (!LIBRARY_RELEVANCE_VIEWS.includes(view)) {
    throw new Error(`Library view must be one of: ${LIBRARY_RELEVANCE_VIEWS.join(', ')}.`);
  }
  if (!LIBRARY_RELEVANCE_SOURCE_SCOPES.includes(sourceScope)) {
    throw new Error('Library source scope must be articles or mixed.');
  }
  const parsedLimit = Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new Error('Library limit must be an integer from 1 to 100.');
  }
  const safeCursor = String(cursor || '').trim();
  if (safeCursor && sourceScope !== 'mixed') {
    throw new Error('Library cursor requires mixed source scope.');
  }
  const params = new URLSearchParams({
    view,
    limit: String(parsedLimit),
    sourceScope
  });
  if (showSuppressed) params.set('showSuppressed', '1');
  if (safeCursor) params.set('cursor', safeCursor);
  const path = `/api/library/relevance?${params.toString()}`;
  const authHeaders = getAuthHeaders();
  const authScope = cacheScopeFor(authHeaders);
  return fetchWithCache(
    `library-relevance:${authScope}:${path}`,
    async () => {
      const response = await api.get(path, authHeaders);
      return requireLibraryPage(response.data, { view, sourceScope });
    },
    { ttlMs: 30_000, force: Boolean(force) }
  );
};

export const getLibrarySourceDetail = async articleId => {
  const safeId = String(articleId || '').trim();
  if (!safeId) return null;
  if (!OBJECT_ID_PATTERN.test(safeId)) {
    throw new Error('Library article id must be a valid object id.');
  }
  const path = `/api/library/relevance/${encodeURIComponent(safeId)}`;
  const authHeaders = getAuthHeaders();
  const authScope = cacheScopeFor(authHeaders);
  return fetchWithCache(
    `library-relevance-detail:${authScope}:${safeId}`,
    async () => {
      const response = await api.get(path, authHeaders);
      if (
        !isPlainObject(response.data?.source)
        || !isPlainObject(response.data.source.source)
        || response.data.source.source.type !== 'article'
        || response.data.source.source.id !== safeId
        || typeof response.data.generatedAt !== 'string'
        || !response.data.generatedAt.trim()
      ) {
        throw new Error('Library source detail response is malformed.');
      }
      return response.data.source;
    },
    { ttlMs: 30_000 }
  );
};
