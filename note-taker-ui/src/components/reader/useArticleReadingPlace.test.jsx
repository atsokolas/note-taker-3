import { act, renderHook } from '@testing-library/react';
import useArticleReadingPlace from './useArticleReadingPlace';
import {
  getArticleReadingState,
  saveArticleReadingState
} from '../../api/articleReadingState';
import { anchorForReadingNode } from './articleReadingPlace';
jest.mock('../../api/articleReadingState');
let root, ref, visible;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  root = document.createElement('div');
  root.innerHTML =
    '<p>First paragraph in the source.</p><p>Second paragraph holding the remembered place.</p><p>A third passage after meaningful reading.</p>';
  document.body.append(root);
  ref = { current: root };
  visible = 0;
  [...root.children].forEach((node, index) => {
    node.scrollIntoView = jest.fn();
    node.getBoundingClientRect = () => ({
      height: 50,
      top: index === visible ? 150 : -100,
      bottom: index === visible ? 200 : -50
    });
  });
  getArticleReadingState.mockResolvedValue(null);
  saveArticleReadingState.mockResolvedValue();
});
afterEach(() => {
  root.remove();
  jest.useRealTimers();
});
const open = async (extra = {}) => {
  let hook;
  await act(async () => {
    hook = renderHook(() =>
      useArticleReadingPlace({
        articleId: 'a',
        contentRef: ref,
        contentKey: 'source',
        enabled: true,
        ...extra
      })
    );
  });
  return hook;
};
const move = async (index, settle = true) => {
  await act(async () => {
    window.dispatchEvent(new Event('wheel'));
    visible = index;
    window.dispatchEvent(new Event('scroll'));
    if (settle) jest.advanceTimersByTime(1400);
  });
};
test('opening resumes without writing and deduplicates unchanged settled positions', async () => {
  getArticleReadingState.mockResolvedValue({
    anchor: anchorForReadingNode(root, root.children[1]),
    ratio: 0.4
  });
  const hook = await open();
  expect(root.children[1].scrollIntoView).toHaveBeenCalled();
  expect(saveArticleReadingState).not.toHaveBeenCalled();
  await move(2);
  expect(saveArticleReadingState).toHaveBeenCalledTimes(1);
  await move(2);
  expect(saveArticleReadingState).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(saveArticleReadingState).toHaveBeenCalledTimes(1);
});
test.each(['highlight', 'search passage', 'URL passage'])(
  '%s explicit arrival defeats automatic resume',
  async () => {
    getArticleReadingState.mockResolvedValue({
      anchor: anchorForReadingNode(root, root.children[1]),
      ratio: 0.4
    });
    const hook = await open({ explicitDestination: true });
    expect(root.children[1].scrollIntoView).not.toHaveBeenCalled();
    expect(saveArticleReadingState).not.toHaveBeenCalled();
    hook.unmount();
  }
);
test('flushes a changed place before leaving and does not write after a passive scroll', async () => {
  const hook = await open();
  await act(async () => {
    visible = 1;
    window.dispatchEvent(new Event('scroll'));
    jest.advanceTimersByTime(2000);
  });
  expect(saveArticleReadingState).not.toHaveBeenCalled();
  await move(2, false);
  hook.unmount();
  expect(saveArticleReadingState).toHaveBeenCalledWith(
    'a',
    expect.objectContaining({
      anchor: expect.objectContaining({ text: root.children[2].textContent })
    }),
    { keepalive: true }
  );
});
test('background failures remain quiet and retry on a later visibility flush', async () => {
  saveArticleReadingState.mockRejectedValueOnce(new Error('offline'));
  const hook = await open();
  await move(2);
  expect(hook.result.current.arrival).toBe('');
  await act(async () => {
    window.dispatchEvent(new Event('pagehide'));
  });
  expect(saveArticleReadingState).toHaveBeenCalledTimes(2);
  hook.unmount();
});
