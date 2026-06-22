import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import SharedWikiCollectionPage, { buildSharedWikiCollectionSchema } from './SharedWikiCollectionPage';
import { adoptPublicWikiCollection, getPublicWikiCollection } from '../api/wiki';

jest.mock('../api/wiki', () => ({
  adoptPublicWikiCollection: jest.fn(),
  getPublicWikiCollection: jest.fn()
}));

const sharedCollection = {
  collection: {
    _id: 'collection-1',
    name: 'Thinking Foundations',
    description: 'A safe public starting point.',
    pages: [
      {
        _id: 'wiki-1',
        title: 'Opportunity Cost',
        sourceCount: 2,
        claimCount: 1,
        body: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Opportunity cost frames tradeoffs.' }] },
            {
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Private neighbor',
                marks: [{ type: 'wikiLink', attrs: { pageId: 'wiki-private', title: 'Private neighbor' } }]
              }]
            }
          ]
        }
      },
      {
        _id: 'wiki-2',
        title: 'Margin of Safety',
        sourceCount: 1,
        claimCount: 0,
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Margin of safety creates room for error.' }] }]
        }
      }
    ]
  }
};

describe('SharedWikiCollectionPage', () => {
  let navigate;

  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    navigate = jest.fn();
    adoptPublicWikiCollection.mockReset();
    getPublicWikiCollection.mockReset();
    getPublicWikiCollection.mockResolvedValue(sharedCollection);
    jest.spyOn(router, 'useParams').mockReturnValue({ idOrSlug: 'thinking-foundations' });
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/share/wiki/collection/thinking-foundations',
      search: '',
      hash: '',
      state: null,
      key: 'test'
    });
  });

  it('renders a public-safe collection with static wiki links', async () => {
    const { unmount } = render(<SharedWikiCollectionPage />);

    await waitFor(() => expect(getPublicWikiCollection).toHaveBeenCalledWith('thinking-foundations'));
    expect(document.documentElement).toHaveClass('noeis-public-share');
    expect(document.body).toHaveClass('noeis-public-share');
    expect(await screen.findByRole('heading', { name: 'Thinking Foundations' })).toBeInTheDocument();
    expect(screen.getByText('A safe public starting point.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adopt shared wiki')).toHaveTextContent(/background maintenance loop/i);
    expect(screen.getByText(/Backlinks, highlights, source notes, and agent work stay private/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Public page ready: citations included, private source notes withheld.');
    expect(screen.getByRole('heading', { name: 'Opportunity Cost' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Margin of Safety' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Private neighbor' })).not.toBeInTheDocument();
    expect(screen.getByText('Private neighbor')).toHaveClass('wiki-internal-link--static');
    await waitFor(() => expect(document.title).toBe('Thinking Foundations · Shared Wiki Collection · Noeis'));
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', 'A safe public starting point.');
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://www.noeis.io/share/wiki/collection/thinking-foundations'
    );
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
    const schema = JSON.parse(document.getElementById('seo-schema').textContent);
    expect(schema).toEqual(expect.objectContaining({
      '@type': 'CollectionPage',
      name: 'Thinking Foundations',
      mainEntityOfPage: 'https://www.noeis.io/share/wiki/collection/thinking-foundations'
    }));
    expect(schema.mainEntity).toEqual(expect.objectContaining({
      '@type': 'ItemList',
      numberOfItems: 2
    }));
    unmount();
    expect(document.body).not.toHaveClass('noeis-public-share');
    expect(document.documentElement).not.toHaveClass('noeis-public-share');
  });

  it('sends logged-out readers through auth with a collection adoption return URL', async () => {
    render(<SharedWikiCollectionPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Make this mine' }));

    expect(adoptPublicWikiCollection).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('auth_return_to')).toBe('/share/wiki/collection/thinking-foundations?adopt=1');
    expect(navigate).toHaveBeenCalledWith('/register');
  });

  it('adopts the collection for signed-in readers and opens the first private page', async () => {
    localStorage.setItem('token', 'test-token');
    adoptPublicWikiCollection.mockResolvedValue({
      pages: [{ _id: 'adopted-1', title: 'Opportunity Cost' }]
    });

    render(<SharedWikiCollectionPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Make this mine' }));

    await waitFor(() => expect(adoptPublicWikiCollection).toHaveBeenCalledWith('thinking-foundations'));
    expect(navigate).toHaveBeenCalledWith('/wiki/workspace?page=adopted-1', { replace: true });
  });

  it('auto-adopts into onboarding after auth redirects back with adopt state', async () => {
    localStorage.setItem('token', 'test-token');
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/share/wiki/collection/thinking-foundations',
      search: '?adopt=1',
      hash: '',
      state: null,
      key: 'test'
    });
    adoptPublicWikiCollection.mockResolvedValue({
      pages: [{ _id: 'adopted-2', title: 'Opportunity Cost' }]
    });

    render(<SharedWikiCollectionPage />);

    await waitFor(() => expect(adoptPublicWikiCollection).toHaveBeenCalledWith('thinking-foundations'));
    expect(navigate).toHaveBeenCalledWith('/onboarding/wiki?adoptedPage=adopted-2&source=shared', { replace: true });
  });

  it('marks unavailable collections noindex', async () => {
    getPublicWikiCollection.mockRejectedValue({ response: { status: 404 } });

    render(<SharedWikiCollectionPage />);

    expect(await screen.findByRole('heading', { name: 'Shared wiki unavailable' })).toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    expect(document.getElementById('seo-schema')).not.toBeInTheDocument();
  });
});

describe('buildSharedWikiCollectionSchema', () => {
  it('builds CollectionPage schema with a public page item list', () => {
    const schema = buildSharedWikiCollectionSchema({
      canonicalPath: '/share/wiki/collection/thinking-foundations',
      description: 'A safe public starting point.',
      collection: { name: 'Thinking Foundations' },
      pages: [
        { title: 'Opportunity Cost' },
        { title: 'Margin of Safety' }
      ]
    });

    expect(schema).toEqual(expect.objectContaining({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Thinking Foundations',
      url: 'https://www.noeis.io/share/wiki/collection/thinking-foundations',
      isAccessibleForFree: true
    }));
    expect(schema.mainEntity.itemListElement).toEqual([
      expect.objectContaining({ '@type': 'ListItem', position: 1, name: 'Opportunity Cost' }),
      expect.objectContaining({ '@type': 'ListItem', position: 2, name: 'Margin of Safety' })
    ]);
  });
});
