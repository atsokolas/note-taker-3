import api from '../api';
import { appendConceptIdeaWorkbenchEvents } from './concepts';

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));

jest.mock('../hooks/useAuthHeaders', () => ({
  getAuthHeaders: () => ({ headers: { Authorization: 'Bearer test' } })
}));

describe('appendConceptIdeaWorkbenchEvents', () => {
  beforeEach(() => jest.clearAllMocks());

  it('serializes event writes for one concept so concurrent model saves cannot collide', async () => {
    const releases = [];
    api.post.mockImplementation(() => new Promise((resolve) => releases.push(resolve)));

    const first = appendConceptIdeaWorkbenchEvents('concept-1', [{ id: 'event-1' }]);
    const second = appendConceptIdeaWorkbenchEvents('concept-1', [{ id: 'event-2' }]);

    await Promise.resolve();
    await Promise.resolve();
    expect(api.post).toHaveBeenCalledTimes(1);

    releases.shift()({ data: { events: [{ id: 'event-1' }] } });
    await first;
    await Promise.resolve();
    expect(api.post).toHaveBeenCalledTimes(2);

    releases.shift()({ data: { events: [{ id: 'event-1' }, { id: 'event-2' }] } });
    await expect(second).resolves.toEqual({ events: [{ id: 'event-1' }, { id: 'event-2' }] });
  });

  it('continues the queue after a failed receipt write', async () => {
    api.post
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ data: { events: [{ id: 'event-2' }] } });

    const first = appendConceptIdeaWorkbenchEvents('concept-2', [{ id: 'event-1' }]);
    const second = appendConceptIdeaWorkbenchEvents('concept-2', [{ id: 'event-2' }]);

    await expect(first).rejects.toThrow('temporary failure');
    await expect(second).resolves.toEqual({ events: [{ id: 'event-2' }] });
    expect(api.post).toHaveBeenCalledTimes(2);
  });
});
