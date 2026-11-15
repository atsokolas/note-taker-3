import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';

/* The signed-in account: { username, since, admin }. */
export const getAccount = async () => (await api.get('/api/account', getAuthHeaders())).data || {};

export const changePassword = async ({ password, newPassword }) => (
  (await api.put('/api/account/password', { password, newPassword }, getAuthHeaders())).data
);

/* Ends access now; erasure of what the account holds follows by hand. */
export const closeAccount = async ({ password }) => (
  (await api.delete('/api/account', { ...getAuthHeaders(), data: { password } })).data
);
