import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/**
 * @typedef {Object} Article
 * @property {string} _id
 * @property {string} title
 * @property {string} url
 * @property {string} createdAt
 * @property {{ _id: string, name: string } | null} [folder]
 * @property {Array} [highlights]
 */

/**
 * @param {Object} params
 * @param {'all'|'unfiled'|'folder'} [params.scope]
 * @param {string} [params.folderId]
 * @param {string} [params.query]
 * @param {'recent'|'oldest'|'most-highlighted'} [params.sort]
 * @param {string} [params.cursor]
 */
export const getArticles = async ({
  scope = 'all',
  folderId = '',
  query = '',
  sort = 'recent',
  cursor
} = {}) => {
  const res = await api.get('/get-articles', getAuthHeaders());
  let articles = res.data || [];

  if (scope === 'unfiled') {
    articles = articles.filter(article => !article.folder);
  } else if (scope === 'folder' && folderId) {
    articles = articles.filter(article => article.folder?._id === folderId);
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery) {
    articles = articles.filter(article =>
      `${article.title || ''} ${article.url || ''}`.toLowerCase().includes(normalizedQuery)
    );
  }

  if (sort === 'oldest') {
    articles = [...articles].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (sort === 'most-highlighted') {
    articles = [...articles].sort((a, b) => (b.highlights?.length || 0) - (a.highlights?.length || 0));
  } else {
    articles = [...articles].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return articles;
};
