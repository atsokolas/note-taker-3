import { renderHook, act } from '@testing-library/react';
import useThinkWritingActivity, { THINK_WRITING_REACH_PX } from './useThinkWritingActivity';

const WRITING_CLASS = 'think-rails-away';

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

  const pointer = (props) => document.dispatchEvent(Object.assign(new Event('pointermove'), { pointerType: 'mouse', ...props }));

  it('keeps the page down through a pause', () => {
    const editor = createEditor();
    renderHook(() => useThinkWritingActivity(editor, { enabled: true }));

    act(() => editor.emit('update', { transaction: { docChanged: true } }));
    act(() => { jest.advanceTimersByTime(60000); });

    expect(document.body.classList.contains(WRITING_CLASS)).toBe(true);
  });

  it('brings the room back when the mouse travels, not when it trembles', () => {
    const editor = createEditor();
    renderHook(() => useThinkWritingActivity(editor, { enabled: true }));

    act(() => editor.emit('update', { transaction: { docChanged: true } }));
    act(() => pointer({ movementX: THINK_WRITING_REACH_PX / 2 }));
    expect(document.body.classList.contains(WRITING_CLASS)).toBe(true);

    act(() => pointer({ movementY: THINK_WRITING_REACH_PX }));
    expect(document.body.classList.contains(WRITING_CLASS)).toBe(false);
  });

  it('ignores touch and pen movement', () => {
    const editor = createEditor();
    renderHook(() => useThinkWritingActivity(editor, { enabled: true }));

    act(() => editor.emit('update', { transaction: { docChanged: true } }));
    act(() => pointer({ pointerType: 'touch', movementX: 400 }));

    expect(document.body.classList.contains(WRITING_CLASS)).toBe(true);
  });

  it('brings the room back on Escape', () => {
    const editor = createEditor();
    renderHook(() => useThinkWritingActivity(editor, { enabled: true }));

    act(() => editor.emit('update', { transaction: { docChanged: true } }));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });

    expect(document.body.classList.contains(WRITING_CLASS)).toBe(false);
  });

  it('restores rails immediately on blur', () => {
    const editor = createEditor();
    renderHook(() => useThinkWritingActivity(editor, { enabled: true }));

    act(() => editor.emit('update', { transaction: { docChanged: true } }));
    act(() => editor.emit('blur'));

    expect(document.body.classList.contains(WRITING_CLASS)).toBe(false);
  });
});
