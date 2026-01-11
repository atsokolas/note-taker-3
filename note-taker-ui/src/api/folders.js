import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/**
 * @typedef {Object} Folder
 * @property {string} _id
 * @property {string} name
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

export const getFolders = async () => {
  const res = await api.get('/folders', getAuthHeaders());
  return res.data || [];
};
