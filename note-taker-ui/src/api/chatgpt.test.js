import api from '../api';
import { getChatGPTConsentRequest, decideChatGPTConsent } from './chatgpt';

jest.mock('../api', () => ({ get: jest.fn(), post: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('token', 'existing-account-jwt');
});
afterEach(() => localStorage.removeItem('token'));
it('loads the opaque request with the current account authorization', async () => {
  api.get.mockResolvedValue({ data: { clientName: 'ChatGPT', scopes: ['read'] } });
  await expect(getChatGPTConsentRequest('opaque/id')).resolves.toEqual({ clientName: 'ChatGPT', scopes: ['read'] });
  expect(api.get).toHaveBeenCalledWith('/api/chatgpt/oauth/requests/opaque%2Fid', { headers: { Authorization: 'Bearer existing-account-jwt' } });
});
it.each([true, false])('sends decision %s with account authorization', async (approved) => {
  api.post.mockResolvedValue({ data: { redirectUrl: 'https://chatgpt.com/callback' } });
  await expect(decideChatGPTConsent('opaque/id', approved)).resolves.toEqual({ redirectUrl: 'https://chatgpt.com/callback' });
  expect(api.post).toHaveBeenCalledWith('/api/chatgpt/oauth/requests/opaque%2Fid/consent', { approved }, { headers: { Authorization: 'Bearer existing-account-jwt' } });
});
