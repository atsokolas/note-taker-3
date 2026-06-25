import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiFrontPage from './WikiFrontPage';
import { listWikiPages, getWikiBriefing } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn(),
  getWikiBriefing: jest.fn()
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
    _id: 'wiki-first-principles',
    title: 'First Principles Thinking',
    pageType: 'topic',
    summary: 'A problem-solving approach that strips a question down to its most basic, self-evident truths and rebuilds solutions from that foundation.',
    sourceRefs: [{ _id: 's1' }, { _id: 's2' }],
    claims: [{ _id: 'c1' }, { _id: 'c2' }, { _id: 'c3' }],
    updatedAt: '2026-06-10T12:00:00.000Z'
  },
  {
    _id: 'wiki-opportunity-cost',
    title: 'Opportunity Cost',
    pageType: 'topic',
    summary: 'Opportunity cost measures the benefit foregone by choosing one alternative over the next-best option.',
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

const briefing = {
  generatedAt: '2026-06-11T08:00:00.000Z',
  summary: 'While you were away I rebuilt Opportunity Cost and linked it to First Principles Thinking.',
  counts: { newSources: 0, recentlyUpdatedPages: 1, driftingPages: 4 },
  recentlyUpdatedPages: [{ _id: 'wiki-first-principles', title: 'First Principles Thinking' }],
  driftingPages: [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }, { _id: 'd' }],
  totalPages: 3
};

describe('WikiFrontPage (AT-394)', () => {
  let navigate;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    navigate = jest.fn();
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    listWikiPages.mockResolvedValue(pages);
    getWikiBriefing.mockResolvedValue(briefing);
  });

  it('names the loading work before the paper arrives', () => {
    listWikiPages.mockReturnValueOnce(new Promise(() => {}));
    getWikiBriefing.mockReturnValueOnce(new Promise(() => {}));

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    expect(document.body.classList.contains('wiki-front-page-route')).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(/checking overnight edits and drift signals/i);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, hidden: true })).toHaveTextContent('Morning paper');
  });

  it('renders the newspaper front page: masthead, lead sentence, today’s page, recently grown, explore, hairline', async () => {
    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    // The agent's lead sentence arrives with the data, but is not duplicated
    // as hidden DOM text that makes the front page read twice in QA/user text.
    const leadText = await screen.findByText(/While you were away I rebuilt Opportunity Cost/i);
    expect(leadText.closest('.wiki-front-page__lead-text')).toHaveAttribute('aria-label', briefing.summary);
    expect(document.body.textContent.match(/While you were away I rebuilt Opportunity Cost/g)).toHaveLength(1);

    // Masthead with date eyebrow.
    expect(screen.getByText(/Morning paper ·/i)).toBeInTheDocument();

    // Today's page = the briefing's most recently updated page, as the single h1.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('First Principles Thinking');
    expect(screen.getByRole('link', { name: 'Continue reading →' }))
      .toHaveAttribute('href', '/wiki/workspace?page=wiki-first-principles');

    // Lead excerpt comes from the full page object (clamped preview).
    expect(screen.getByText(/strips a question down to its most basic/i)).toBeInTheDocument();

    // Recently grown excludes the lead story and carries growth notes.
    const grown = screen.getByRole('complementary', { name: /recently grown/i });
    expect(grown).toHaveTextContent('Opportunity Cost');
    expect(grown).not.toHaveTextContent('First Principles Thinking');
    expect(grown).toHaveTextContent(/claim/);

    // Explore index links pages.
    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Margin of Safety' })[0])
      .toHaveAttribute('href', '/wiki/workspace?page=wiki-margin-of-safety');

    // Machinery is behind the hairline — with the review count, off the door.
    expect(screen.getByRole('link', { name: /review \(4\)/i }))
      .toHaveAttribute('href', '/wiki/workspace?view=graph');
    expect(screen.getByRole('link', { name: 'knowledge map' })).toBeInTheDocument();

    // No review queue / counters dumped on the front door.
    expect(screen.queryByText(/pages need review/i)).not.toBeInTheDocument();
  });

  it('falls back to the strongest page when the briefing fails', async () => {
    getWikiBriefing.mockRejectedValueOnce(new Error('down'));

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    // Weighted fallback: most sources+claims wins the lead slot.
    const heading = await screen.findByRole('heading', { level: 1, name: 'First Principles Thinking' });
    expect(heading).toHaveTextContent('First Principles Thinking');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('opens the onboarding arc when the corpus is empty and onboarding is incomplete', async () => {
    listWikiPages
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    getWikiBriefing.mockResolvedValueOnce({ ...briefing, recentlyUpdatedPages: [], totalPages: 0 });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/onboarding/wiki', { replace: true }));
    expect(await screen.findByText(/opening the first-page flow/i)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('keeps the fallback empty composer after onboarding has been completed', async () => {
    localStorage.setItem('noeis.wikiOnboardingComplete', 'true');
    listWikiPages
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    getWikiBriefing.mockResolvedValueOnce({ ...briefing, recentlyUpdatedPages: [], totalPages: 0 });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    expect(await screen.findByRole('heading', { level: 1, name: /start your wiki/i }))
      .toHaveTextContent(/start your wiki/i);
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Ask the wiki agent to build a page')).toBeInTheDocument();
  });

  it('does not redirect returning users whose pages are hidden from the front page', async () => {
    listWikiPages
      .mockResolvedValueOnce([{ _id: 'debug-page', title: 'Internal QA', debugOnly: true }])
      .mockResolvedValueOnce([{ _id: 'debug-page', title: 'Internal QA', debugOnly: true }]);
    getWikiBriefing.mockResolvedValueOnce({ ...briefing, recentlyUpdatedPages: [], totalPages: 1 });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    expect(await screen.findByRole('heading', { level: 1, name: /start your wiki/i }))
      .toHaveTextContent(/start your wiki/i);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps generated QA pages out of the hero and Explore even if the API returns them', async () => {
    listWikiPages.mockResolvedValueOnce([
      {
        _id: 'qa-page',
        title: 'QA Build Order Verification 2026-06-19',
        summary: 'A browser verification page that should not become the front door.',
        sourceRefs: [{ _id: 'qa-source' }],
        claims: [{ _id: 'qa-claim' }],
        updatedAt: '2026-06-11T13:00:00.000Z'
      },
      ...pages
    ]);
    listWikiPages.mockResolvedValueOnce([
      {
        _id: 'qa-page',
        title: 'QA Build Order Verification 2026-06-19',
        summary: 'A browser verification page that should not become the front door.'
      },
      ...pages
    ]);
    getWikiBriefing.mockResolvedValueOnce({
      ...briefing,
      recentlyUpdatedPages: [{ _id: 'qa-page', title: 'QA Build Order Verification 2026-06-19' }]
    });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'First Principles Thinking' }))
      .toBeInTheDocument();
    expect(screen.queryByText(/QA Build Order Verification/i)).not.toBeInTheDocument();
  });
});
