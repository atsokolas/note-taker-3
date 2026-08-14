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

  it('does not latch a ready this build has not reached', async () => {
    // Observed on production: the page reports `ready` mid-flight, before
    // publication decides whether to promote it, then lands on `error`. Latching
    // the first ready told the user their page was done and stopped polling, so
    // the banner announced a page that did not exist.
    const startedAt = '2026-08-14T01:23:02.000Z';
    getWikiPageBuildStatus
      .mockResolvedValueOnce({ status: 'ready', error: '', errorCode: '', completedAt: null, page: null })
      .mockResolvedValueOnce({
        status: 'error',
        error: 'Ordinary reference article introduces claims with no lexical anchor.',
        errorCode: 'WIKI_CANDIDATE_REJECTED',
        completedAt: '2026-08-14T01:23:50.000Z',
        page: null
      });

    const { result } = renderHook(() => useWikiBuildProgress('page-1', { intervalMs: 1, startedAt }));

    await waitFor(() => expect(result.current.isFailed).toBe(true));
    expect(result.current.isReady).toBe(false);
    expect(result.current.error).toMatch(/no lexical anchor/);
  });

  it('accepts a terminal status once the build reports finishing', async () => {
    const startedAt = '2026-08-14T01:23:02.000Z';
    getWikiPageBuildStatus.mockResolvedValue({
      status: 'ready', error: '', errorCode: '', completedAt: '2026-08-14T01:23:40.000Z', page: {}
    });

    const { result } = renderHook(() => useWikiBuildProgress('page-1', { intervalMs: 1, startedAt }));
    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it('ignores a terminal status left over from an earlier build of the same page', async () => {
    getWikiPageBuildStatus
      .mockResolvedValueOnce({ status: 'ready', error: '', errorCode: '', completedAt: '2026-08-14T01:00:00.000Z', page: {} })
      .mockResolvedValue({ status: 'ready', error: '', errorCode: '', completedAt: '2026-08-14T01:24:00.000Z', page: {} });

    const { result } = renderHook(() => useWikiBuildProgress('page-1', {
      intervalMs: 1, startedAt: '2026-08-14T01:23:02.000Z'
    }));

    // The stale completion is older than this build's start, so it is not this
    // build finishing.
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(getWikiPageBuildStatus.mock.calls.length).toBeGreaterThan(1);
  });
});