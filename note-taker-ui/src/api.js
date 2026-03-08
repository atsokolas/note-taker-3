import axios from 'axios';

const BASE_URL = "https://note-taker-3-unrg.onrender.com";
let authRedirectInFlight = false;

const parseJwtExpiry = (token) => {
  try {
    const payloadPart = String(token || '').split('.')[1];
    if (!payloadPart) return 0;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded));
    return Number(decoded?.exp || 0);
  } catch (_error) {
    return 0;
  }
};

const clearStoredTokens = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('authToken');
  localStorage.removeItem('jwt');
  if (window.chrome && window.chrome.storage) {
    window.chrome.storage.local.remove(['token', 'authToken', 'jwt']);
  }
};

const redirectToLogin = (reason = 'auth') => {
  if (authRedirectInFlight) return;
  authRedirectInFlight = true;
  clearStoredTokens();
  try {
    sessionStorage.setItem('auth_redirect_reason', reason);
  } catch (_error) {
    // ignore storage failures
  }
  window.location.href = '/login';
};

// Create a new instance of axios
const api = axios.create({
  baseURL: BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (!token) return config;

  const exp = parseJwtExpiry(token);
  const now = Math.floor(Date.now() / 1000);
  if (exp > 0 && exp <= now) {
    redirectToLogin('expired');
    const error = new Error('AUTH_EXPIRED');
    error.code = 'AUTH_EXPIRED_LOCAL';
    return Promise.reject(error);
  }

  if (!config.headers) config.headers = {};
  if (!config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add a response interceptor
api.interceptors.response.use(
  // If the response is successful, just return it
  (response) => response,
  // If the response has an error...
  (error) => {
    // Check if the error is a 401 (Unauthorized) or 403 (Forbidden)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      const authError = error.response.data?.error;
      const reason = authError === 'AUTH_EXPIRED' ? 'expired' : 'unauthorized';
      console.log("Authentication error detected. Redirecting to login.");
      redirectToLogin(reason);
    }
    // For all other errors, just pass them along
    return Promise.reject(error);
  }
);

export default api;
