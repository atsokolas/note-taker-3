import api from '../api';
import { importQuestionShareRecords } from './questions';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer qa' } })
}));

describe('importQuestionShareRecords', () => {
  beforeEach(() => {
    api.post.mockReset();
  });

  it('returns a portable record through the share write path', async () => {
    api.post.mockResolvedValue({
      data: {
        records: { retained: ['successor'], restored: ['succession'], sameDoor: true }
      }
    });
    const result = await importQuestionShareRecords('q1', { markdown: '# Still open' });
    expect(result.records.sameDoor).toBe(true);
    expect(api.post).toHaveBeenCalledWith(
      '/api/questions/q1/share/records',
      { markdown: '# Still open' },
      { headers: { Authorization: 'Bearer qa' } }
    );
  });
});
