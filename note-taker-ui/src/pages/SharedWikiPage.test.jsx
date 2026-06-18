import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import SharedWikiPage from './SharedWikiPage';
import { adoptPublicWikiPage, getPublicWikiPage } from '../api/wiki';

jest.mock('../api/wiki', () => ({
  adoptPublicWikiPage: jest.fn(),
  getPublicWikiPage: jest.fn()
}));

const mockParams = (idOrSlug) => {
  jest.spyOn(router, 'useParams').mockReturnValue({ idOrSlug });
};

describe('SharedWikiPage', () => {
  let navigate;

  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    navigate = jest.fn();
    adoptPublicWikiPage.mockReset();
    getPublicWikiPage.mockReset();
    mockParams('opportunity-cost');
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/share/wiki/opportunity-cost',
      search: '',
      hash: '',
      state: null,
      key: 'test'
    });
  });

  it('renders a shared wiki page for public readers', async () => {
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'wiki-1',
        title: 'Opportunity Cost',
        visibility: 'shared',
        updatedAt: '2026-06-08T12:00:00.000Z',
        sourceRefs: [{
          _id: 'source-1',
          title: 'Munger notes',
          url: 'https://example.com/munger',
          snippet: 'A cited source.'
        }],
        body: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Opportunity cost frames tradeoffs.' }] },
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Evidence' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'The evidence section is public.' }] },
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
      }
    });

    render(<SharedWikiPage />);

    await waitFor(() => expect(getPublicWikiPage).toHaveBeenCalledWith('opportunity-cost'));
    expect(await screen.findByRole('heading', { name: 'Opportunity Cost' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Public page ready: citations included, private source notes withheld.');
    expect(screen.getAllByText('Opportunity cost frames tradeoffs.')).toHaveLength(2);
    expect(screen.getByText('References')).toBeInTheDocument();
    expect(screen.getByText(/Private backlinks, source notes, graph edges, and agent work are not exposed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make this mine' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Munger notes' })).toHaveAttribute('href', 'https://example.com/munger');
    expect(screen.queryByRole('link', { name: 'Private neighbor' })).not.toBeInTheDocument();
    expect(screen.getByText('Private neighbor')).toHaveClass('wiki-internal-link--static');
    expect(screen.getByRole('link', { name: 'Open Noeis' })).toHaveAttribute('href', '/');
  });

  it('sends logged-out readers through auth with a return-to adoption URL', async () => {
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'wiki-1',
        title: 'Opportunity Cost',
        visibility: 'shared',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared page.' }] }] },
        sourceRefs: []
      }
    });

    render(<SharedWikiPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Make this mine' }));

    expect(adoptPublicWikiPage).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('auth_return_to')).toBe('/share/wiki/opportunity-cost?adopt=1');
    expect(navigate).toHaveBeenCalledWith('/register');
  });

  it('adopts shared pages for signed-in readers and opens the private copy', async () => {
    localStorage.setItem('token', 'test-token');
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'wiki-1',
        title: 'Opportunity Cost',
        visibility: 'shared',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared page.' }] }] },
        sourceRefs: []
      }
    });
    adoptPublicWikiPage.mockResolvedValue({
      page: { _id: 'adopted-1', title: 'Opportunity Cost' }
    });

    render(<SharedWikiPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Make this mine' }));

    await waitFor(() => expect(adoptPublicWikiPage).toHaveBeenCalledWith('opportunity-cost'));
    expect(navigate).toHaveBeenCalledWith('/wiki/workspace?page=adopted-1', { replace: true });
  });

  it('auto-adopts after auth redirects back with adopt state', async () => {
    localStorage.setItem('token', 'test-token');
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/share/wiki/opportunity-cost',
      search: '?adopt=1',
      hash: '',
      state: null,
      key: 'test'
    });
    getPublicWikiPage.mockResolvedValue({
      page: {
        _id: 'wiki-1',
        title: 'Opportunity Cost',
        visibility: 'shared',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shared page.' }] }] },
        sourceRefs: []
      }
    });
    adoptPublicWikiPage.mockResolvedValue({
      page: { _id: 'adopted-2', title: 'Opportunity Cost' }
    });

    render(<SharedWikiPage />);

    await waitFor(() => expect(adoptPublicWikiPage).toHaveBeenCalledWith('opportunity-cost'));
    expect(navigate).toHaveBeenCalledWith('/wiki/workspace?page=adopted-2', { replace: true });
  });

  it('shows a private-page message when the public endpoint returns 404', async () => {
    getPublicWikiPage.mockRejectedValue({ response: { status: 404 } });

    render(<SharedWikiPage />);

    expect(await screen.findByRole('heading', { name: 'Shared page unavailable' })).toBeInTheDocument();
    expect(screen.getByText('This wiki page is private, archived, or no longer exists.')).toBeInTheDocument();
  });
});
