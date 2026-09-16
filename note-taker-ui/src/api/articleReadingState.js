import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

export const getArticleReadingState = async (articleId) =>
  (
    await api.get(
      `/api/articles/${encodeURIComponent(articleId)}/reading-state`,
      getAuthHeaders()
    )
  ).data?.readingState || null;

export const saveArticleReadingState = async (
  articleId,
  place,
  { keepalive = false } = {}
) => {
  const path = `/api/articles/${encodeURIComponent(articleId)}/reading-state`;
  if (keepalive) {
    // fetch keepalive survives pagehide; a beacon cannot carry our auth header.
    const response = await fetch(`${api.defaults.baseURL || ''}${path}`, {
      method: 'PUT',
      keepalive: true,
      headers: {
        ...getAuthHeaders().headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(place)
    });
    if (!response.ok) throw new Error('Reading place did not sync.');
    return;
  }
  await api.put(path, place, getAuthHeaders());
};
