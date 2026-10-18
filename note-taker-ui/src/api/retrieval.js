import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

const toCsv = (input) => {
  if (!input) return '';
  if (Array.isArray(input)) return input.filter(Boolean).join(',');
  return String(input || '').trim();
};

export const searchKeyword = async ({ q, scope = 'all', tags = [], type = [], notebookId = '' }) => {
  const params = new URLSearchParams();
  params.set('q', String(q || '').trim());
  if (scope && scope !== 'all') params.set('scope', scope);
  const tagsCsv = toCsv(tags);
  if (tagsCsv) params.set('tags', tagsCsv);
  const typeCsv = toCsv(type);
  if (typeCsv) params.set('type', typeCsv);
  if (notebookId) params.set('notebookId', String(notebookId).trim());

  const response = await api.get(`/api/search?${params.toString()}`, getAuthHeaders());
  return response.data;
};

export const recordItemView = async ({ itemType, itemId, previousItemType = '', previousItemId = '' }) => {
  const response = await api.post(
    '/api/retrieval/view',
    {
      itemType,
      itemId,
      previousItemType,
      previousItemId
    },
    getAuthHeaders()
  );
  return response.data;
};

export const fetchRelatedItems = async ({ itemType, itemId, limit = 8 }) => {
  const params = new URLSearchParams();
  params.set('itemType', String(itemType || '').trim());
  params.set('itemId', String(itemId || '').trim());
  params.set('limit', String(limit));
  const response = await api.get(`/api/retrieval/related?${params.toString()}`, getAuthHeaders());
  return response.data;
};

/* The closest passages you marked elsewhere, one per paragraph at most.
   An empty list is the whole answer when nothing is close or the index is
   unreachable; the margin then stays empty. */
export const fetchMarginNotes = async ({ paragraphs = [], articleId = '', excludeHighlightIds = [] } = {}) => {
  const response = await api.post(
    '/api/semantic/margins',
    { paragraphs, articleId, excludeHighlightIds },
    getAuthHeaders()
  );
  return Array.isArray(response.data?.notes) ? response.data.notes : [];
};

const retrievalApi = {
  searchKeyword,
  recordItemView,
  fetchRelatedItems,
  fetchMarginNotes
};

export default retrievalApi;
