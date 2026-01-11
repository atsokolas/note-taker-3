import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/**
 * @typedef {Object} Folder
 * @property {string} _id
 * @property {string} name
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 * @property {string | null} [parentFolderId]
 * @property {number} [sortOrder]
 * @property {number} [articleCount]
 */

export const getFolders = async () => {
  const res = await api.get('/api/folders?includeCounts=true', getAuthHeaders());
  return res.data || [];
};
