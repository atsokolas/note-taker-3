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

/* Opening a passage again; the reader inks it a little deeper. */
export const markPassageOpened = async (articleId, highlightId) => {
  await api.post(
    `/api/articles/${encodeURIComponent(articleId)}/highlights/${encodeURIComponent(highlightId)}/opened`,
    null,
    getAuthHeaders()
  );
};

/* Open source was pressed. The server looks once (a HEAD, at most daily) and
   answers when, if ever, the original was found gone. */
export const checkOriginalSource = async (articleId) => (
  await api.post(`/api/articles/${encodeURIComponent(articleId)}/source-check`, null, getAuthHeaders())
).data?.sourceGoneAt || null;
