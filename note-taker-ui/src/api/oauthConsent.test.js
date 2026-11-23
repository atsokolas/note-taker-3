import api from '../api';
import { getConsentRequest, decideConsent } from './oauthConsent';

jest.mock('../api', () => ({ get: jest.fn(), post: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('token', 'existing-account-jwt');
});
afterEach(() => localStorage.removeItem('token'));
it('loads the opaque request with the current account authorization', async () => {
  api.get.mockResolvedValue({ data: { clientName: 'ChatGPT', scopes: ['read'] } });
  await expect(getConsentRequest('opaque/id')).resolves.toEqual({ clientName: 'ChatGPT', scopes: ['read'] });
  expect(api.get).toHaveBeenCalledWith('/api/chatgpt/oauth/requests/opaque%2Fid', { headers: { Authorization: 'Bearer existing-account-jwt' } });
});
it.each([true, false])('sends decision %s with account authorization', async (approved) => {
  api.post.mockResolvedValue({ data: { redirectUrl: 'https://chatgpt.com/callback' } });
  await expect(decideConsent('opaque/id', approved)).resolves.toEqual({ redirectUrl: 'https://chatgpt.com/callback' });
  expect(api.post).toHaveBeenCalledWith('/api/chatgpt/oauth/requests/opaque%2Fid/consent', { approved }, { headers: { Authorization: 'Bearer existing-account-jwt' } });
});
it('can narrow a decision to the scopes the person chose', async () => {
  api.post.mockResolvedValue({ data: { redirectUrl: 'https://claude.ai/callback' } });
  await decideConsent('id', true, ['read']);
  expect(api.post).toHaveBeenCalledWith('/api/chatgpt/oauth/requests/id/consent', { approved: true, scopes: ['read'] }, { headers: { Authorization: 'Bearer existing-account-jwt' } });
});
