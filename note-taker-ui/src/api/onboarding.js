import api from '../api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

export const fetchOnboardingState = async () => {
  const res = await api.get('/api/onboarding/state', getAuthHeaders());
  return res.data || {};
};

export const markOnboardingCompleteOnServer = async () => {
  const res = await api.post('/api/onboarding/complete', {}, getAuthHeaders());
  return res.data || {};
};

const onboardingApi = { fetchOnboardingState, markOnboardingCompleteOnServer };

export default onboardingApi;
