import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiBacklinkPanel from './WikiBacklinkPanel';
import { getWikiBacklinks } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  getWikiBacklinks: jest.fn()
}));

const mount = (props = {}) => render(
  <MemoryRouter>
    <WikiBacklinkPanel pageId="wiki-1" pageTitle="Compounding interest" {...props} />
  </MemoryRouter>
);

describe('WikiBacklinkPanel', () => {
  beforeEach(() => {
    getWikiBacklinks.mockReset();
  });

  it('renders the loading skeleton while the request is in flight', () => {
    getWikiBacklinks.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByTestId('wiki-backlinks')).toBeInTheDocument();
    expect(screen.getByText('Mentioned in')).toBeInTheDocument();
  });

  it('renders nothing when the API returns an empty backlinks list', async () => {
    getWikiBacklinks.mockResolvedValueOnce({ backlinks: [], scanned: 4 });
    const { container } = mount();
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders nothing when the API request fails', async () => {
    getWikiBacklinks.mockRejectedValueOnce(new Error('boom'));
    const { container } = mount();
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders one item per backlink with title, mention count, and snippet', async () => {
    getWikiBacklinks.mockResolvedValueOnce({
      scanned: 12,
      backlinks: [
        { pageId: 'a', title: 'Strategy', mentionCount: 3, snippet: '…says compounding interest matters…', updatedAt: new Date().toISOString() },
        { pageId: 'b', title: 'Network effects', mentionCount: 1, snippet: '…compounding interest cohorts…', updatedAt: new Date(Date.now() - 60_000 * 60).toISOString() }
      ]
    });
    mount();
    // The component debounces the title-driven refetch by 400ms, so wait
    // for the post-debounce populated render rather than the initial
    // skeleton phase.
    expect(await screen.findByText('2 pages')).toBeInTheDocument();
    expect(screen.getByText('Strategy').closest('a')).toHaveAttribute('href', '/wiki/workspace?page=a');
    expect(screen.getByText(/3 mentions/)).toBeInTheDocument();
    expect(screen.getByText(/1 mention/)).toBeInTheDocument();
    expect(screen.getByText(/says compounding interest matters/)).toBeInTheDocument();
  });

  it('refetches when the page title changes', async () => {
    getWikiBacklinks
      .mockResolvedValueOnce({ scanned: 1, backlinks: [{ pageId: 'a', title: 'A', mentionCount: 1, snippet: 'old' }] })
      .mockResolvedValueOnce({ scanned: 1, backlinks: [{ pageId: 'b', title: 'B', mentionCount: 1, snippet: 'new' }] });
    const { rerender } = mount();
    await waitFor(() => expect(getWikiBacklinks).toHaveBeenCalledTimes(1));
    rerender(
      <MemoryRouter>
        <WikiBacklinkPanel pageId="wiki-1" pageTitle="A different title" />
      </MemoryRouter>
    );
    await waitFor(() => expect(getWikiBacklinks).toHaveBeenCalledTimes(2));
  });

  it('does not fire a request when no pageId is provided', () => {
    mount({ pageId: '' });
    expect(getWikiBacklinks).not.toHaveBeenCalled();
  });
});
