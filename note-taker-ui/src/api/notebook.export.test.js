import api from '../api';
import { exportNotebookMarkdown } from './notebook';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer qa' } })
}));

describe('exportNotebookMarkdown', () => {
  beforeEach(() => {
    api.get.mockReset();
  });

  it('downloads through the configured API client, not a relative fetch', async () => {
    const blob = new Blob(['# Letter\n'], { type: 'text/markdown' });
    api.get.mockResolvedValue({ data: blob });

    const result = await exportNotebookMarkdown('essay-1');

    expect(result).toBe(blob);
    expect(api.get).toHaveBeenCalledWith('/api/export/notebook/essay-1', {
      headers: { Authorization: 'Bearer qa' },
      responseType: 'blob'
    });
  });
});
