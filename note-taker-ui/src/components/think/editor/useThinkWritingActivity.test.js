import { renderHook, act } from '@testing-library/react';
import useThinkWritingActivity, { THINK_WRITING_IDLE_MS } from './useThinkWritingActivity';

const WRITING_CLASS = 'think-writing-active';

const createEditor = () => {
  const handlers = {};
  return {
    on: jest.fn((event, handler) => {
      handlers[event] = handlers[event] || [];
      handlers[event].push(handler);
    }),
    off: jest.fn((event, handler) => {
      handlers[event] = (handlers[event] || []).filter((registered) => registered !== handler);
    }),
    emit(event, payload) {
      (handlers[event] || []).forEach((handler) => handler(payload));
    }
  };
};

describe('useThinkWritingActivity', () => {
  beforeEach(() => {
    document.body.classList.remove(WRITING_CLASS);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    document.body.classList.remove(WRITING_CLASS);
  });

  it('does not retreat rails on focus alone', () => {
    const editor = createEditor();
    renderHook(() => useThinkWritingActivity(editor, { enabled: true }));

    act(() => editor.emit('focus'));

    expect(document.body.classList.contains(WRITING_CLASS)).toBe(false);
  });

  it('retreats rails when the document changes', () => {
    const editor = createEditor();
    renderHook(() => useThinkWritingActivity(editor, { enabled: true }));

    act(() => editor.emit('update', { transaction: { docChanged: true } }));

    expect(document.body.classList.contains(WRITING_CLASS)).toBe(true);
  });

  it('does not retreat rails for selection-only updates', () => {
    const editor = createEditor();
    renderHook(() => useThinkWritingActivity(editor, { enabled: true }));

    act(() => editor.emit('update', { transaction: { docChanged: false } }));

    expect(document.body.classList.contains(WRITING_CLASS)).toBe(false);
  });

  it('restores rails after typing goes idle', () => {
    const editor = createEditor();
    renderHook(() => useThinkWritingActivity(editor, { enabled: true }));

    act(() => editor.emit('update', { transaction: { docChanged: true } }));
    act(() => {
      jest.advanceTimersByTime(THINK_WRITING_IDLE_MS - 1);
    });
    expect(document.body.classList.contains(WRITING_CLASS)).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(document.body.classList.contains(WRITING_CLASS)).toBe(false);
  });

  it('keeps rails retreated if typing resumes before idle', () => {
    const editor = createEditor();
    renderHook(() => useThinkWritingActivity(editor, { enabled: true }));

    act(() => editor.emit('update', { transaction: { docChanged: true } }));
    act(() => {
      jest.advanceTimersByTime(THINK_WRITING_IDLE_MS - 200);
    });
    act(() => editor.emit('update', { transaction: { docChanged: true } }));
    act(() => {
      jest.advanceTimersByTime(THINK_WRITING_IDLE_MS - 1);
    });

    expect(document.body.classList.contains(WRITING_CLASS)).toBe(true);
  });

  it('restores rails immediately on blur', () => {
    const editor = createEditor();
    renderHook(() => useThinkWritingActivity(editor, { enabled: true }));

    act(() => editor.emit('update', { transaction: { docChanged: true } }));
    act(() => editor.emit('blur'));

    expect(document.body.classList.contains(WRITING_CLASS)).toBe(false);
  });
});
