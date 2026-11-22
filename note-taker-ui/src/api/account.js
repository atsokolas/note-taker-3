import api from '../api';
import { getAuthHeaders } from '../hooks/useAuthHeaders';
import { storeToken } from '../components/auth/AuthPage';

/* The signed-in account: { username, since, admin }. */
export const getAccount = async () => (await api.get('/api/account', getAuthHeaders())).data || {};

/* A new password signs out every other session; this one keeps going on the token it returns. */
export const changePassword = async ({ password, newPassword }) => {
  const changed = (await api.put('/api/account/password', { password, newPassword }, getAuthHeaders())).data;
  if (changed?.token) storeToken(changed.token);
  return changed;
};

/* Ends access now; erasure of what the account holds follows by hand. */
export const closeAccount = async ({ password }) => (
  (await api.delete('/api/account', { ...getAuthHeaders(), data: { password } })).data
);
