import { act, renderHook, waitFor } from '@testing-library/react';
import useWikiBuildProgress from './useWikiBuildProgress';
import { getWikiPageBuildStatus } from '../api/wiki';

jest.mock('../api/wiki', () => ({
  getWikiPageBuildStatus: jest.fn()
}));

describe('useWikiBuildProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports ready once the build finishes and stops polling', async () => {
    getWikiPageBuildStatus
      .mockResolvedValueOnce({ status: 'maintaining', error: '', errorCode: '', page: null })
      .mockResolvedValueOnce({ status: 'ready', error: '', errorCode: '', page: { title: 'Loss Aversion' } });

    const { result } = renderHook(() => useWikiBuildProgress('page-1', { intervalMs: 1 }));

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.page).toEqual({ title: 'Loss Aversion' });

    const callsAtCompletion = getWikiPageBuildStatus.mock.calls.length;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    // Terminal state means no further requests.
    expect(getWikiPageBuildStatus).toHaveBeenCalledTimes(callsAtCompletion);
  });

  it('surfaces a failed build instead of spinning forever', async () => {
    getWikiPageBuildStatus.mockResolvedValue({
      status: 'error',
      error: 'The draft did not pass the quality bar.',
      errorCode: 'WIKI_CANDIDATE_REJECTED',
      page: null
    });

    const { result } = renderHook(() => useWikiBuildProgress('page-1', { intervalMs: 1 }));

    await waitFor(() => expect(result.current.isFailed).toBe(true));
    expect(result.current.error).toBe('The draft did not pass the quality bar.');
    expect(result.current.isBuilding).toBe(false);
  });

  it('keeps polling through a dropped request rather than declaring failure', async () => {
    getWikiPageBuildStatus
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValue({ status: 'ready', error: '', errorCode: '', page: {} });

    const { result } = renderHook(() => useWikiBuildProgress('page-1', { intervalMs: 1 }));

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.isFailed).toBe(false);
  });

  it('stays idle with no page to watch', () => {
    const { result } = renderHook(() => useWikiBuildProgress('', { intervalMs: 1 }));
    expect(result.current.status).toBe('idle');
    expect(getWikiPageBuildStatus).not.toHaveBeenCalled();
  });
});
