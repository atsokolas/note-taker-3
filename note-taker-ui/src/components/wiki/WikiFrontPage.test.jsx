import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiFrontPage from './WikiFrontPage';
import { listWikiPages } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn()
}));

jest.mock('./WikiCreationComposer', () => () => (
  <section aria-label="Create a wiki">
    <button type="button">Wiki</button>
    <button type="button">Repo wiki</button>
    <button type="button">Investment dossier</button>
  </section>
));

jest.mock('../agent/ThoughtPartnerPanel', () => ({ title = 'Thought partner' }) => (
  <section aria-label={`${title} panel`}>Thought partner</section>
));

jest.mock('../../utils/wikiFeatureFlags', () => ({
  wikiPagePath: (pageId) => `/wiki/workspace?page=${pageId}`,
  wikiReadPath: (pageId, suffix = '') => `/wiki/read/${pageId}${suffix ? `?${String(suffix).replace(/^[?&]/, '')}` : ''}`
}));

const pages = [
  {
    _id: 'wiki-first-principles',
    title: 'First Principles Thinking',
    pageType: 'topic',
    summary: 'A problem-solving approach that strips a question down to its most basic, self-evident truths and rebuilds solutions from that foundation.',
    plainText: 'A useful strategy connects an intention to a pattern of choices.',
    sourceRefs: [{ _id: 's1' }, { _id: 's2' }],
    claims: [{ _id: 'c1' }, { _id: 'c2' }, { _id: 'c3' }],
    updatedAt: '2026-06-10T12:00:00.000Z'
  },
  {
    _id: 'wiki-opportunity-cost',
    title: 'Opportunity Cost',
    pageType: 'topic',
    summary: 'Opportunity cost measures the benefit foregone by choosing one alternative over the next-best option.',
    plainText: 'Naming what will not be pursued makes a choice inspectable.',
    sourceRefs: [{ _id: 's3' }],
    claims: [{ _id: 'c4' }],
    updatedAt: '2026-06-09T12:00:00.000Z'
  },
  {
    _id: 'wiki-margin-of-safety',
    title: 'Margin of Safety',
    pageType: 'topic',
    summary: 'Buying assets at a discount to conservative intrinsic value.',
    sourceRefs: [],
    claims: [{ _id: 'c5' }],
    updatedAt: '2026-06-08T12:00:00.000Z'
  }
];

describe('WikiFrontPage collection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    jest.spyOn(router, 'useNavigate').mockReturnValue(jest.fn());
    listWikiPages.mockResolvedValue(pages);
  });

  afterEach(() => jest.restoreAllMocks());

  it('prints a quiet collection: search plus one list, without the paper', async () => {
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 1, name: 'Wiki' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search current Wiki pages' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'First Principles Thinking' }))
      .toHaveAttribute('href', '/wiki/read/wiki-first-principles');
    expect(screen.queryByRole('table', { name: 'Living Wiki pages' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Current Wiki briefing')).not.toBeInTheDocument();
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
    expect(screen.queryByText('Your Wiki ·')).not.toBeInTheDocument();
    expect(document.querySelector('.paper-open__masthead')).not.toBeInTheDocument();
    expect(document.querySelector('.paper-desk')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Full workspace' }))
      .toHaveAttribute('href', '/wiki/workspace?view=list');
    expect(screen.getByRole('link', { name: 'Map & disagreements' }))
      .toHaveAttribute('href', '/wiki/workspace?view=graph');
  });

  it('uses compact navigation beside the list instead of a catalog shelf', async () => {
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 1, name: 'Wiki' })).toBeInTheDocument();
    expect(document.querySelector('.room-shelf')).not.toBeInTheDocument();
    expect(screen.queryByText('Browse wikis')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Wiki views')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Wiki navigation' });
    expect(nav).toHaveClass('wiki-collection__nav');
    expect(within(nav).getByRole('button', { name: 'All pages' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Proposed changes' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Recently changed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'First Principles Thinking' }).closest('.wiki-collection__stage'))
      .not.toBeNull();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New page' })).toBeInTheDocument();
  });

  it('opens accepted pages without waiting for a Daily Loop briefing', async () => {
    let resolvePages;
    listWikiPages.mockReturnValueOnce(new Promise((resolve) => { resolvePages = resolve; }));
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);
    expect(screen.getByText(/Opening your pages/i)).toBeInTheDocument();
    resolvePages(pages);
    expect(await screen.findByRole('link', { name: 'First Principles Thinking' })).toBeInTheDocument();
  });

  it('prints only the grounded canonical page for a duplicated title', async () => {
    listWikiPages.mockResolvedValueOnce([
      {
        _id: 'wiki-bare',
        title: 'Opportunity Cost',
        pageType: 'topic',
        summary: 'A second draft that never got sources.',
        sourceRefs: [],
        claims: [],
        updatedAt: '2026-06-20T12:00:00.000Z'
      },
      pages[1],
      pages[2]
    ]);
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);
    const list = await screen.findByRole('link', { name: 'Opportunity Cost' });
    expect(list).toHaveAttribute('href', '/wiki/read/wiki-opportunity-cost');
    expect(screen.getAllByRole('link', { name: 'Opportunity Cost' })).toHaveLength(1);
  });

  it('keeps generated QA pages out of the collection even if the API returns them', async () => {
    listWikiPages.mockResolvedValueOnce([
      pages[0],
      {
        _id: 'qa-generated',
        title: 'QA public wiki 1750000000000',
        pageType: 'topic',
        summary: 'Generated fixture.',
        updatedAt: '2026-06-11T12:00:00.000Z'
      }
    ]);
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'First Principles Thinking' })).toBeInTheDocument();
    expect(screen.queryByText(/QA public wiki/)).not.toBeInTheDocument();
  });

  it('groups general wikis, repository wikis, and investment dossiers without presenting proposals as accepted knowledge', async () => {
    listWikiPages.mockResolvedValueOnce([
      pages[0],
      {
        _id: 'wiki-repo',
        title: 'Atlas repository',
        pageType: 'repo',
        repoKey: 'org/atlas',
        summary: 'Entry points for the repository.',
        updatedAt: '2026-06-08T12:00:00.000Z'
      },
      {
        _id: 'wiki-dossier',
        title: 'Aster Works',
        pageType: 'topic',
        investmentDossier: { version: 1 },
        summary: 'A company case.',
        updatedAt: '2026-06-07T12:00:00.000Z',
        aiState: { candidateStatus: 'awaiting_maintenance_acceptance', lastCandidateSummary: 'UNIQUE_CANDIDATE_PHRASE' }
      }
    ]);
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Atlas repository' })).toBeInTheDocument();
    expect(screen.getAllByText('Repository wikis').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Investment dossiers').length).toBeGreaterThan(0);
    expect(screen.getByText('Proposed change')).toBeInTheDocument();
    expect(screen.queryByText(/Accepted/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search current Wiki pages' }), {
      target: { value: 'UNIQUE_CANDIDATE_PHRASE' }
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No pages match.' })).toBeInTheDocument();
    });
  });

  it('opens the dedicated investment dossier collection from its stable URL', async () => {
    listWikiPages.mockResolvedValueOnce([
      pages[0],
      {
        _id: 'wiki-dossier',
        title: 'Aster Works',
        investmentDossier: { version: 1 },
        summary: 'A company case.',
        updatedAt: '2026-06-07T12:00:00.000Z'
      }
    ]);
    render(
      <router.MemoryRouter initialEntries={['/wiki/dossiers']}>
        <WikiFrontPage initialKind="investment" />
      </router.MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: 'Aster Works' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'First Principles Thinking' })).not.toBeInTheDocument();
  });

  it('keeps the fallback empty composer after onboarding has been completed', async () => {
    localStorage.setItem('noeis.wikiOnboardingComplete', 'true');
    listWikiPages.mockResolvedValueOnce([]);
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);
    expect(await screen.findByRole('heading', { level: 1, name: 'Wiki' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Create a wiki' })).toBeInTheDocument();
  });

  it('does not redirect returning users whose pages are hidden from the front page', async () => {
    listWikiPages.mockResolvedValueOnce([{
      ...pages[0],
      hiddenFromHome: true
    }]);
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);
    expect(await screen.findByRole('heading', { level: 1, name: 'Wiki' })).toBeInTheDocument();
    expect(screen.queryByText(/Opening the first-page flow/)).not.toBeInTheDocument();
  });
});
