import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import useSemanticRelated from './useSemanticRelated';
import { fetchSemanticRelated } from '../api/retrieval';

jest.mock('../api/retrieval', () => ({
  fetchSemanticRelated: jest.fn()
}));

const HookProbe = ({ sourceType = 'highlight', sourceId = 'h-1' }) => {
  const { results, meta, loading, error } = useSemanticRelated({
    sourceType,
    sourceId,
    limit: 6,
    resultTypes: ['highlight'],
    enabled: true
  });
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error}</span>
      <span data-testid="count">{results.length}</span>
      <span data-testid="meta-source">{meta?.sourceId || ''}</span>
      <span data-testid="title">{results[0]?.title || ''}</span>
    </div>
  );
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useSemanticRelated', () => {
  beforeEach(() => {
    fetchSemanticRelated.mockReset();
  });

  it('caches responses for repeated source lookups', async () => {
    fetchSemanticRelated.mockResolvedValue({
      results: [{ objectType: 'highlight', objectId: 'h-2', title: 'Cached row' }],
      meta: { sourceType: 'highlight', sourceId: 'h-1', modelAvailable: true }
    });

    const first = render(<HookProbe sourceId="h-1" />);
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    expect(fetchSemanticRelated).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<HookProbe sourceId="h-1" />);
    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Cached row'));
    expect(fetchSemanticRelated).toHaveBeenCalledTimes(1);
  });

  it('ignores stale requests when source changes quickly', async () => {
    const slow = deferred();
    fetchSemanticRelated
      .mockImplementationOnce(() => slow.promise)
      .mockResolvedValueOnce({
        results: [{ objectType: 'highlight', objectId: 'h-new', title: 'Fresh row' }],
        meta: { sourceType: 'highlight', sourceId: 'h-new', modelAvailable: true }
      });

    const view = render(<HookProbe sourceId="h-old" />);
    view.rerender(<HookProbe sourceId="h-new" />);

    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Fresh row'));
    slow.resolve({
      results: [{ objectType: 'highlight', objectId: 'h-old', title: 'Stale row' }],
      meta: { sourceType: 'highlight', sourceId: 'h-old', modelAvailable: true }
    });

    await waitFor(() => expect(screen.getByTestId('title')).toHaveTextContent('Fresh row'));
    expect(screen.getByTestId('meta-source')).toHaveTextContent('h-new');
  });
});
