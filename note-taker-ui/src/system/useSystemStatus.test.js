import { act, renderHook } from '@testing-library/react';
import { useSystemStatus } from './useSystemStatus';

describe('useSystemStatus', () => {
  it('starts empty and accepts local updates for each slice', () => {
    const { result } = renderHook(() => useSystemStatus());

    expect(result.current.backgroundWork).toBeNull();
    expect(result.current.latestReceipt).toBeNull();
    expect(result.current.recoverableFailure).toBeNull();

    act(() => {
      result.current.setBackgroundWork({ label: 'Syncing Readwise' });
    });
    expect(result.current.backgroundWork).toEqual({ label: 'Syncing Readwise' });

    act(() => {
      result.current.setLatestReceipt({ title: 'Readwise sync', summary: '47 highlights attached' });
    });
    expect(result.current.latestReceipt?.title).toBe('Readwise sync');

    act(() => {
      result.current.setRecoverableFailure({ stage: 'Import', message: 'Retry sync' });
    });
    expect(result.current.recoverableFailure?.message).toBe('Retry sync');

    act(() => {
      result.current.resetSystemStatus();
    });
    expect(result.current.backgroundWork).toBeNull();
    expect(result.current.latestReceipt).toBeNull();
    expect(result.current.recoverableFailure).toBeNull();
    expect(result.current.recentReceipts).toEqual([]);
  });

  it('accumulates receipt history up to 5 and drops the oldest', () => {
    const { result } = renderHook(() => useSystemStatus());

    act(() => {
      result.current.setLatestReceipt({ id: 'r1', title: 'First', summary: 'One' });
    });
    act(() => {
      result.current.setLatestReceipt({ id: 'r2', title: 'Second', summary: 'Two' });
    });
    act(() => {
      result.current.setLatestReceipt({ id: 'r3', title: 'Third', summary: 'Three' });
    });
    act(() => {
      result.current.setLatestReceipt({ id: 'r4', title: 'Fourth', summary: 'Four' });
    });
    act(() => {
      result.current.setLatestReceipt({ id: 'r5', title: 'Fifth', summary: 'Five' });
    });
    expect(result.current.recentReceipts.map((receipt) => receipt.id)).toEqual(['r5', 'r4', 'r3', 'r2', 'r1']);

    act(() => {
      result.current.setLatestReceipt({ id: 'r6', title: 'Sixth', summary: 'Six' });
    });
    expect(result.current.recentReceipts.map((receipt) => receipt.id)).toEqual(['r6', 'r5', 'r4', 'r3', 'r2']);
  });

  it('dedupes receipt history by id when the same receipt updates', () => {
    const { result } = renderHook(() => useSystemStatus());

    act(() => {
      result.current.setLatestReceipt({ id: 'r1', title: 'First', summary: 'Draft' });
    });
    act(() => {
      result.current.setLatestReceipt({ id: 'r2', title: 'Second', summary: 'Two' });
    });
    act(() => {
      result.current.setLatestReceipt({ id: 'r1', title: 'First', summary: 'Final' });
    });
    expect(result.current.recentReceipts).toEqual([
      { id: 'r1', title: 'First', summary: 'Final' },
      { id: 'r2', title: 'Second', summary: 'Two' }
    ]);
  });

  it('clears receipt history without affecting the latest receipt', () => {
    const { result } = renderHook(() => useSystemStatus());

    act(() => {
      result.current.setLatestReceipt({ id: 'r1', title: 'First', summary: 'One' });
    });
    act(() => {
      result.current.setLatestReceipt({ id: 'r2', title: 'Second', summary: 'Two' });
    });

    act(() => {
      result.current.clearRecentReceipts();
    });
    expect(result.current.recentReceipts).toEqual([]);
    expect(result.current.latestReceipt?.title).toBe('Second');
  });

  it('does not publish a new state for semantically identical background work', () => {
    const { result } = renderHook(() => useSystemStatus());

    act(() => {
      result.current.setBackgroundWork({ label: 'Repo wiki rebuild', stage: 'Rebuilding owner/repo' });
    });
    const settled = result.current;

    act(() => {
      result.current.setBackgroundWork({ label: 'Repo wiki rebuild', stage: 'Rebuilding owner/repo' });
      result.current.clearRecoverableFailure();
    });

    expect(result.current).toBe(settled);
  });

  it('does not republish identical receipts or recoverable failures', () => {
    const { result } = renderHook(() => useSystemStatus());
    const receipt = { id: 'repo-review', title: 'Needs review', summary: 'Trusted page preserved', status: 'needs_review' };
    const failure = { stage: 'Repo rebuild', message: 'Candidate rejected', retryable: true };

    act(() => {
      result.current.setLatestReceipt(receipt);
      result.current.setRecoverableFailure(failure);
    });
    const settled = result.current;

    act(() => {
      result.current.setLatestReceipt({ ...receipt });
      result.current.setRecoverableFailure({ ...failure });
    });

    expect(result.current).toBe(settled);
    expect(result.current.recentReceipts).toHaveLength(1);
  });
});
