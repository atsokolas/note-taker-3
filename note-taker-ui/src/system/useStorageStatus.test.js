import { act, renderHook, waitFor } from '@testing-library/react';
import api from '../api';
import { useStorageStatus } from './useStorageStatus';
jest.mock('../api', () => ({ get: jest.fn() }));
jest.mock('../hooks/useAuthHeaders', () => ({ getAuthHeaders: () => ({}) }));
afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });
test('public sessions do not request private storage status', () => {
  const { result } = renderHook(() => useStorageStatus(false));
  expect(result.current).toBeNull(); expect(api.get).not.toHaveBeenCalled();
});
test('failure appears in the existing status contract and clears on recovery', async () => {
  jest.useFakeTimers();
  api.get.mockResolvedValueOnce({ data: { storage: { message: 'Daily history cleanup needs attention.' } } });
  const { result, rerender } = renderHook(({ enabled }) => useStorageStatus(enabled), { initialProps: { enabled: true } });
  await waitFor(() => expect(result.current?.stage).toBe('storage'));
  expect(result.current.retryable).toBe(false);
  api.get.mockResolvedValueOnce({ data: { storage: { message: '' } } });
  await act(async () => { jest.advanceTimersByTime(5 * 60 * 1000); });
  expect(result.current).toBeNull();
  rerender({ enabled: false });
  await act(async () => { jest.advanceTimersByTime(5 * 60 * 1000); });
  expect(api.get).toHaveBeenCalledTimes(2);
});
test('a failed poll does not invent a storage outage', async () => {
  api.get.mockRejectedValueOnce(new Error('network'));
  const { result } = renderHook(() => useStorageStatus(true));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
  expect(result.current).toBeNull();
});
