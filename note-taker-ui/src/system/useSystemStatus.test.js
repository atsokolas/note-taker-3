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
  });
});
