import api from '../api';
import { fetchUiSettings, saveUiSettings } from './uiSettings';
import { fetchWithCache } from '../utils/cache';
jest.mock('../api', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn() } }));
jest.mock('../hooks/useAuthHeaders', () => ({ getAuthHeaders: () => ({ headers: { Authorization: 'Bearer current' } }) }));
jest.mock('../utils/cache', () => ({ fetchWithCache: jest.fn(async () => ({ theme: 'light' })), clearCached: jest.fn() }));
test('Work appearance reads fresh human cosmetics without the shared cache or auth redirects', async () => {
  api.get.mockResolvedValue({ data: { theme: 'tokyo-midnight' } });
  const options = { skipAuthHandling: true, headers: { Authorization: 'Bearer captured-owner' } };
  expect(await fetchUiSettings({}, options)).toEqual({ theme: 'tokyo-midnight' });
  expect(api.get).toHaveBeenCalledWith('/api/ui-settings', expect.objectContaining(options)); expect(fetchWithCache).not.toHaveBeenCalled();
  api.put.mockResolvedValue({ data: { theme: 'nord' } }); await saveUiSettings({ theme: 'nord' }, {}, options);
  expect(api.put.mock.calls[0][2]).toMatchObject(options);
});
