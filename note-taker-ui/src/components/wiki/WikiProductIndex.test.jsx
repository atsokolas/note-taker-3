import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiProductIndex from './WikiProductIndex';
import { listWikiPages } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn()
}));

jest.mock('./WikiBuildPageComposer', () => ({ className = '' }) => (
  <form className={className} aria-label="Ask the wiki agent to build a page">
    <input aria-label="Build page prompt" />
    <button type="button">Build page</button>
  </form>
));

jest.mock('../../utils/wikiFeatureFlags', () => ({
  wikiPagePath: (pageId) => `/wiki/workspace?page=${pageId}`
}));

const pages = [
  {
    _id: 'wiki-investing',
    title: 'Investing',
    pageType: 'overview',
    summary: 'A source-backed synthesis of investing practice.',
    sourceRefs: [{ _id: 's1' }, { _id: 's2' }],
    claims: [{ _id: 'c1' }, { _id: 'c2' }],
    updatedAt: '2026-05-14T12:00:00.000Z'
  },
  {
    _id: 'wiki-machine',
    title: 'Complementary Machine Thing',
    pageType: 'concept',
    plainText: 'A machine concept.',
    sourceRefs: [{ _id: 's3' }],
    claims: [{ _id: 'c3' }],
    updatedAt: '2026-05-13T12:00:00.000Z'
  }
];

describe('WikiProductIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listWikiPages.mockResolvedValue(pages);
  });

  it('renders a sparse product-facing wiki index', async () => {
    render(
      <MemoryRouter>
        <WikiProductIndex />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Your source-backed knowledge base' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ask the wiki agent to build a page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open workspace' })).toHaveAttribute('href', '/wiki/workspace');
    expect(screen.getByRole('link', { name: 'All pages' })).toHaveAttribute('href', '/wiki/workspace?view=list');
    expect(screen.getByRole('link', { name: 'Knowledge map' })).toHaveAttribute('href', '/wiki/workspace?view=graph');

    expect(await screen.findByRole('heading', { name: 'Key pages' })).toBeInTheDocument();
    expect(listWikiPages).toHaveBeenCalledWith({ limit: 80 });
    expect(screen.getAllByRole('link', { name: /Investing/ })[0]).toHaveAttribute('href', '/wiki/workspace?page=wiki-investing');
    expect(screen.getByText('A source-backed synthesis of investing practice.')).toBeInTheDocument();

    const overview = screen.getByLabelText('Wiki overview');
    expect(overview).toHaveTextContent('Pages2');
    expect(overview).toHaveTextContent('Sources cited3');
    expect(overview).toHaveTextContent('Top typesConcept, Overview');
  });

  it('shows a quiet empty state when there are no pages', async () => {
    listWikiPages.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <WikiProductIndex />
      </MemoryRouter>
    );

    const empty = await screen.findByRole('heading', { name: 'No wiki pages yet' });
    expect(empty).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Key pages' })).not.toBeInTheDocument();
  });

  it('surfaces load failure without showing graph maintenance UI', async () => {
    listWikiPages.mockRejectedValueOnce(new Error('down'));

    render(
      <MemoryRouter>
        <WikiProductIndex />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load wiki pages.');
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Knowledge map' })).not.toBeInTheDocument();
      expect(screen.queryByText('Feed the wiki')).not.toBeInTheDocument();
    });
  });
});
