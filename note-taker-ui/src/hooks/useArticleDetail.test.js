import { act, renderHook, waitFor } from '@testing-library/react';
import api from '../api';
import useArticleDetail, { classifyArticleDetailError } from './useArticleDetail';

jest.mock('../api', () => ({ get: jest.fn() }));

const articleResponse = (id) => ({ data: { _id: id, title: `Source ${id}` } });

const supportingResponse = (url) => url.endsWith('/highlights')
  ? { data: [] }
  : { data: { notebookBlocks: [], collections: [] } };

describe('useArticleDetail', () => {
  beforeEach(() => {
    api.get.mockReset();
  });

  it('uses calm, stable error categories instead of leaking transport copy', () => {
    expect(classifyArticleDetailError({ response: { status: 404 } })).toEqual({
      kind: 'missing',
      message: 'This source is no longer available in your Library.'
    });
    expect(classifyArticleDetailError({ response: { status: 403 } }).kind).toBe('unavailable');
    expect(classifyArticleDetailError(new Error('socket exploded'))).toEqual({
      kind: 'failed',
      message: 'Library could not open this source.'
    });
  });

  it('retries the exact source identity after a recoverable failure', async () => {
    let articleAttempts = 0;
    api.get.mockImplementation((url) => {
      if (url === '/articles/a1') {
        articleAttempts += 1;
        return articleAttempts === 1
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(articleResponse('a1'));
      }
      return Promise.resolve(supportingResponse(url));
    });

    const { result } = renderHook(() => useArticleDetail('a1'));
    await waitFor(() => expect(result.current.errorKind).toBe('failed'));
    expect(result.current.article).toBeNull();

    await act(async () => { await result.current.refresh(); });

    expect(result.current.article?._id).toBe('a1');
    expect(result.current.error).toBe('');
    expect(articleAttempts).toBe(2);
  });

  it('does not let a late response replace a newer source', async () => {
    let resolveFirst;
    const first = new Promise(resolve => { resolveFirst = resolve; });
    api.get.mockImplementation((url) => {
      if (url === '/articles/a1') return first;
      if (url === '/articles/a2') return Promise.resolve(articleResponse('a2'));
      return Promise.resolve(supportingResponse(url));
    });

    const { result, rerender } = renderHook(
      ({ id }) => useArticleDetail(id),
      { initialProps: { id: 'a1' } }
    );
    rerender({ id: 'a2' });
    await waitFor(() => expect(result.current.article?._id).toBe('a2'));

    await act(async () => { resolveFirst(articleResponse('a1')); });

    expect(result.current.article?._id).toBe('a2');
  });

  it('clears the prior source immediately when identity changes', async () => {
    let resolveSecond;
    const second = new Promise(resolve => { resolveSecond = resolve; });
    api.get.mockImplementation((url) => {
      if (url === '/articles/a1') return Promise.resolve(articleResponse('a1'));
      if (url === '/articles/a2') return second;
      return Promise.resolve(supportingResponse(url));
    });

    const { result, rerender } = renderHook(
      ({ id }) => useArticleDetail(id),
      { initialProps: { id: 'a1' } }
    );
    await waitFor(() => expect(result.current.article?._id).toBe('a1'));

    rerender({ id: 'a2' });
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.article).toBeNull();

    await act(async () => { resolveSecond(articleResponse('a2')); });
  });
});
