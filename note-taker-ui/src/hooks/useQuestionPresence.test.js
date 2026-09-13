import { renderHook, waitFor } from '@testing-library/react';
import useQuestionPresence from './useQuestionPresence';

jest.mock('../api/questions', () => ({
  beatQuestionPresence: jest.fn(),
  getQuestionPresence: jest.fn()
}));

const { beatQuestionPresence, getQuestionPresence } = require('../api/questions');

describe('useQuestionPresence', () => {
  const token = window.localStorage.getItem('token');

  afterEach(() => {
    beatQuestionPresence.mockReset();
    getQuestionPresence.mockReset();
    if (token == null) window.localStorage.removeItem('token');
    else window.localStorage.setItem('token', token);
  });

  it('polls named presence without listing the viewer', async () => {
    window.localStorage.removeItem('token');
    getQuestionPresence.mockResolvedValue({ here: [{ by: 'Mara' }] });
    const { result } = renderHook(() => useQuestionPresence('qslug', {
      enabled: true,
      seed: []
    }));
    await waitFor(() => expect(result.current).toEqual([{ by: 'Mara' }]));
    expect(beatQuestionPresence).not.toHaveBeenCalled();
  });

  it('beats when signed in and keeps the last names if a later poll fails', async () => {
    window.localStorage.setItem('token', 'owner-token');
    beatQuestionPresence
      .mockResolvedValueOnce({ present: true, here: [{ by: 'Mara' }] })
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useQuestionPresence('qslug', { enabled: true }));
    await waitFor(() => expect(result.current).toEqual([{ by: 'Mara' }]));
    expect(getQuestionPresence).not.toHaveBeenCalled();
  });
});
