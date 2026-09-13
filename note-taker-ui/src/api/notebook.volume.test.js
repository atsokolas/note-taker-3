import api from '../api';
import { getNotebookVolume, previewNotebookVolume } from './notebook';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer qa' } })
}));

const auth = { headers: { Authorization: 'Bearer qa' } };

describe('notebook volume preview', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
  });

  it('loads the published volume without a query string', async () => {
    api.get.mockResolvedValue({ data: { shared: false, catalog: [] } });

    await getNotebookVolume();

    expect(api.get).toHaveBeenCalledWith('/api/volumes', auth);
    const path = api.get.mock.calls[0][0];
    expect(path).toBe('/api/volumes');
    expect(path).not.toMatch(/[?&](title|introduction)=/);
  });

  it('sends unpublished title and introduction in the preview body, not the GET URL', async () => {
    api.post.mockResolvedValue({ data: { shared: false, publishable: true } });

    await previewNotebookVolume({
      notebookIds: ['note-1', 'note-2'],
      title: 'Who pays?',
      introduction: 'Unpublished through-line.'
    });

    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith('/api/volumes/preview', {
      notebookIds: ['note-1', 'note-2'],
      title: 'Who pays?',
      introduction: 'Unpublished through-line.'
    }, auth);
    const path = api.post.mock.calls[0][0];
    expect(path).not.toMatch(/[?&](title|introduction)=/);
  });
});
