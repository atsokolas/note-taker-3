import { renderHook } from '@testing-library/react';
import React from 'react';
import { SystemStatusProvider, useSystemStatusControls, useSystemStatusSnapshot, NOOP_CONTROLS } from './SystemStatusContext';
import { EMPTY_SYSTEM_STATUS } from './systemStatusModel';

describe('SystemStatusContext', () => {
  it('returns safe no-op controls with no provider mounted', () => {
    const { result } = renderHook(() => useSystemStatusControls());
    expect(result.current).toBe(NOOP_CONTROLS);
    // calling any control is a no-op, never throws
    expect(() => result.current.setBackgroundWork({ label: 'x' })).not.toThrow();
    expect(() => result.current.setLatestReceipt(null)).not.toThrow();
    expect(() => result.current.clearRecentReceipts()).not.toThrow();
  });

  it('returns an empty snapshot with no provider mounted', () => {
    const { result } = renderHook(() => useSystemStatusSnapshot());
    expect(result.current).toEqual(EMPTY_SYSTEM_STATUS);
  });

  it('exposes the provided controls and snapshot to consumers', () => {
    const controls = {
      setBackgroundWork: jest.fn(),
      setLatestReceipt: jest.fn(),
      clearRecentReceipts: jest.fn(),
      setRecoverableFailure: jest.fn(),
      clearRecoverableFailure: jest.fn(),
      resetSystemStatus: jest.fn()
    };
    const snapshot = {
      ...EMPTY_SYSTEM_STATUS,
      latestReceipt: { title: 'Synced', summary: 'done' }
    };
    const wrapper = ({ children }) => (
      <SystemStatusProvider value={{ controls, snapshot }}>{children}</SystemStatusProvider>
    );
    const controlsResult = renderHook(() => useSystemStatusControls(), { wrapper });
    const snapshotResult = renderHook(() => useSystemStatusSnapshot(), { wrapper });
    expect(controlsResult.result.current).toBe(controls);
    expect(snapshotResult.result.current.latestReceipt).toEqual({ title: 'Synced', summary: 'done' });
  });

  it('supports legacy controls-only provider values', () => {
    const controls = {
      setBackgroundWork: jest.fn(),
      setLatestReceipt: jest.fn(),
      clearRecentReceipts: jest.fn(),
      setRecoverableFailure: jest.fn(),
      clearRecoverableFailure: jest.fn(),
      resetSystemStatus: jest.fn()
    };
    const wrapper = ({ children }) => (
      <SystemStatusProvider value={controls}>{children}</SystemStatusProvider>
    );
    const { result } = renderHook(() => useSystemStatusControls(), { wrapper });
    expect(result.current).toBe(controls);
    result.current.setLatestReceipt({ title: 'Synced', summary: 'done' });
    result.current.clearRecentReceipts();
    expect(controls.setLatestReceipt).toHaveBeenCalledWith({ title: 'Synced', summary: 'done' });
    expect(controls.clearRecentReceipts).toHaveBeenCalledTimes(1);
  });
});
