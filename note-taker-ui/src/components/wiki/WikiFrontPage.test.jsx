import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiFrontPage from './WikiFrontPage';
import { listWikiPages } from '../../api/wiki';
import { getDailyLoop, recordClaimCheckIn, armReadingWatch, disarmWatcher } from '../../api/dailyLoop';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn()
}));

jest.mock('../../api/dailyLoop', () => ({
  getDailyLoop: jest.fn(),
  recordClaimCheckIn: jest.fn(),
  armReadingWatch: jest.fn(),
  disarmWatcher: jest.fn()
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
    getDailyLoop.mockResolvedValue({ briefing });
    recordClaimCheckIn.mockResolvedValue({ acknowledgment: 'reaffirmed · 1st time · held 12 days', streak: 1 });
    armReadingWatch.mockResolvedValue({});
    disarmWatcher.mockResolvedValue({});
  });

  it('names the loading work before the paper arrives', () => {
    listWikiPages.mockReturnValueOnce(new Promise(() => {}));
    getDailyLoop.mockReturnValueOnce(new Promise(() => {}));

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    expect(document.body.classList.contains('wiki-front-page-route')).toBe(true);
    expect(document.querySelector('.wiki-front-page__graph-motif')).toBeInTheDocument();
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

    // The agent's lead sentence arrives as complete visible text. It is not
    // duplicated as hidden DOM text and never renders as a partial word stream.
    const leadText = await screen.findByText(/While you were away I rebuilt Opportunity Cost/i);
    expect(listWikiPages).toHaveBeenCalledTimes(1);
    expect(listWikiPages).toHaveBeenCalledWith({ limit: 80, includeLowQuality: 1 });
    expect(leadText.closest('.wiki-front-page__lead-text')).toHaveTextContent(/\.$/);
    expect(leadText.closest('.wiki-front-page__lead-text')).not.toHaveAttribute('aria-label');
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

    // Workspace destinations are legible secondary nav near the top.
    const workspaceNav = screen.getByRole('navigation', { name: 'Wiki workspace' });
    expect(workspaceNav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review \(4\)/i }))
      .toHaveAttribute('href', '/wiki/workspace?view=graph');
    expect(screen.getByRole('link', { name: 'Knowledge map' })).toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();

    // No review queue / counters dumped on the front door.
    expect(screen.queryByText(/pages need review/i)).not.toBeInTheDocument();
  });

  it('falls back to the strongest page when the briefing fails', async () => {
    getDailyLoop.mockRejectedValueOnce(new Error('down'));

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
    listWikiPages.mockResolvedValueOnce([]);
    getDailyLoop.mockResolvedValueOnce({ briefing: { ...briefing, recentlyUpdatedPages: [], totalPages: 0 } });

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
    listWikiPages.mockResolvedValueOnce([]);
    getDailyLoop.mockResolvedValueOnce({ briefing: { ...briefing, recentlyUpdatedPages: [], totalPages: 0 } });

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
    listWikiPages.mockResolvedValueOnce([{ _id: 'debug-page', title: 'Internal QA', debugOnly: true }]);
    getDailyLoop.mockResolvedValueOnce({ briefing: { ...briefing, recentlyUpdatedPages: [], totalPages: 1 } });

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
    getDailyLoop.mockResolvedValueOnce({ briefing: {
      ...briefing,
      recentlyUpdatedPages: [{ _id: 'qa-page', title: 'QA Build Order Verification 2026-06-19' }]
    } });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'First Principles Thinking' }))
      .toBeInTheDocument();
    expect(screen.queryByText(/QA Build Order Verification/i)).not.toBeInTheDocument();
  });

  it('renders a cached morning paper immediately while refreshing in place', async () => {
    localStorage.setItem('noeis.wiki.frontPageSnapshot.v1', JSON.stringify({
      cachedAt: Date.now(),
      pages,
      briefing,
      hasAnyWikiContent: true
    }));
    listWikiPages.mockReturnValueOnce(new Promise(() => {}));
    getDailyLoop.mockReturnValueOnce(new Promise(() => {}));

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'First Principles Thinking' }))
      .toBeInTheDocument();
    expect(screen.getByText(/While you were away I rebuilt Opportunity Cost/i)).toBeInTheDocument();
    expect(listWikiPages).toHaveBeenCalledTimes(1);
    expect(listWikiPages).toHaveBeenCalledWith({ limit: 80, includeLowQuality: 1 });
    expect(getDailyLoop).toHaveBeenCalledTimes(1);
  });

  it('shows a failed-import next action in the briefing area', async () => {
    getDailyLoop.mockResolvedValueOnce({ briefing: {
      ...briefing,
      summary: 'Readwise needs attention before the next sync.',
      nextAction: {
        type: 'review_import',
        label: 'Review Readwise connection',
        href: '/connections',
        reason: 'Readwise needs a fresh authorization.'
      }
    } });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    const nextAction = await screen.findByRole('link', { name: /review readwise connection →/i });
    expect(nextAction).toHaveAttribute('href', '/connections');
    expect(screen.getByText('Readwise needs a fresh authorization.')).toBeInTheDocument();
  });

  it('shows an answerable-question next action and question note', async () => {
    getDailyLoop.mockResolvedValueOnce({ briefing: {
      ...briefing,
      summary: 'One open question now has fresh evidence.',
      nextAction: {
        type: 'answer_question',
        label: 'Answer the question that now has evidence',
        href: '/think?tab=questions&questionId=q1',
        reason: 'Opportunity Cost gained 2 sources'
      },
      answerableQuestions: [{
        questionId: 'q1',
        text: 'How does opportunity cost show up in capital allocation?',
        evidencePageTitle: 'Opportunity Cost',
        evidenceCount: 2,
        href: '/think?tab=questions&questionId=q1'
      }]
    } });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    const nextAction = await screen.findByRole('link', {
      name: /answer the question that now has evidence →/i
    });
    expect(nextAction).toHaveAttribute('href', '/think?tab=questions&questionId=q1');

    expect(screen.queryByRole('region', { name: /overnight briefing notes/i })).not.toBeInTheDocument();
    expect(screen.getByText('Evidence surfaced')).toBeInTheDocument();
    expect(screen.getByText(/fresh evidence via opportunity cost \(2 sources\)/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /how does opportunity cost show up in capital allocation/i }))
      .toHaveAttribute('href', '/think?tab=questions&questionId=q1');
  });

  it('uses pages that gained source material as the lead story and compact evidence line', async () => {
    getDailyLoop.mockResolvedValueOnce({ briefing: {
      ...briefing,
      summary: 'Opportunity Cost gained new backing sources overnight.',
      nextAction: {
        type: 'review_page',
        label: 'Review Opportunity Cost',
        href: '/wiki/workspace?page=wiki-opportunity-cost',
        reason: '2 new sources reached this page'
      },
      pagesWithNewSourceMaterial: [{
        pageId: 'wiki-opportunity-cost',
        title: 'Opportunity Cost',
        addedSourceCount: 2,
        sourceTitles: ['Tradeoff note', 'Capital allocation note']
      }]
    } });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    await screen.findByRole('link', { name: /review opportunity cost →/i });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Opportunity Cost');
    expect(screen.queryByRole('region', { name: /overnight briefing notes/i })).not.toBeInTheDocument();
    expect(screen.getByText('Evidence surfaced')).toBeInTheDocument();
    expect(screen.getByText('2 new sources — Tradeoff note, Capital allocation note')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Opportunity Cost' })[0])
      .toHaveAttribute('href', '/wiki/workspace?page=wiki-opportunity-cost');
  });

  it('does not render unsafe backend-provided next-action hrefs', async () => {
    getDailyLoop.mockResolvedValueOnce({ briefing: {
      ...briefing,
      nextAction: {
        type: 'review_page',
        label: 'Open external target',
        href: 'https://example.com/bad',
        reason: 'This should not become a router link.'
      }
    } });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    await screen.findByText(/While you were away/i);
    expect(screen.queryByRole('link', { name: /open external target/i })).not.toBeInTheDocument();
  });

  it('dedupes duplicate repo wikis from Explore and keeps a non-repo Today\'s page', async () => {
    const duplicateRepos = Array.from({ length: 6 }, (_, index) => ({
      _id: `repo-dup-${index}`,
      title: 'Atsokolas/Note-Taker-3 Repo Wiki',
      pageType: 'repo',
      summary: 'Generic repo wiki template prose.',
      sourceRefs: [{ _id: `repo-source-${index}` }],
      claims: [{ _id: `repo-claim-${index}` }],
      updatedAt: `2026-07-0${index + 1}T12:00:00.000Z`,
      externalWatches: {
        githubRepo: {
          owner: 'atsokolas',
          repo: 'note-taker-3',
          status: 'active',
          lastCheckedAt: '2026-01-01T12:00:00.000Z'
        }
      }
    }));

    listWikiPages.mockResolvedValueOnce([
      ...duplicateRepos,
      ...pages
    ]);
    getDailyLoop.mockResolvedValueOnce({ briefing: {
      ...briefing,
      recentlyUpdatedPages: [{ _id: 'wiki-first-principles', title: 'First Principles Thinking' }],
      pagesWithNewSourceMaterial: []
    } });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'First Principles Thinking' }))
      .toBeInTheDocument();

    const explore = screen.getByText('Explore').closest('section');
    const exploreLinks = within(explore).getAllByRole('link');
    const repoTitles = exploreLinks.filter((link) => /repo wiki/i.test(link.textContent));

    expect(repoTitles).toHaveLength(1);
    expect(explore.textContent.match(/note-taker-3 — repo wiki/g)).toHaveLength(1);
    expect(explore.textContent.match(/Atsokolas\/Note-Taker-3 Repo Wiki/g)).toBeNull();
    expect(within(explore).getByText('Margin of Safety')).toBeInTheDocument();
    expect(within(explore).getByText('Opportunity Cost')).toBeInTheDocument();
  });

  it('leads with a watcher event, renders exact claim impact, and completes a check-in', async () => {
    getDailyLoop.mockResolvedValueOnce({ briefing: {
      ...briefing,
      lead: {
        title: 'NVDA filed a 10-Q',
        page: { id: 'wiki-first-principles', title: 'Nvidia dossier' },
        watcherLabel: 'EDGAR',
        maintenanceStatus: 'completed',
        href: '/wiki/workspace?page=wiki-first-principles',
        impactSummary: '2 claims touched · 1 contradicted',
        claimImpacts: [{ claimId: 'c1', beforeSupport: 'partial', afterSupport: 'conflicted' }]
      },
      watcherLeads: [{
        title: 'NVDA filed a 10-Q',
        page: { id: 'wiki-first-principles', title: 'Nvidia dossier' },
        impactSummary: '2 claims touched · 1 contradicted',
        claimImpacts: [{ claimId: 'c1', beforeSupport: 'partial', afterSupport: 'conflicted' }]
      }],
      claimCheckIn: {
        pageId: 'wiki-first-principles',
        pageTitle: 'Nvidia dossier',
        claimId: 'c1',
        text: 'Integration retains pricing power.',
        changedSinceLastCheck: true,
        href: '/wiki/workspace?page=wiki-first-principles&claimId=c1'
      },
      watching: [{
        id: 'wiki-first-principles:sec_edgar',
        type: 'sec_edgar',
        label: 'EDGAR · NVDA',
        detail: '10-Q Jul 19',
        status: 'active',
        page: { id: 'wiki-first-principles', title: 'Nvidia dossier' }
      }]
    } });

    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByText(/NVDA filed a 10-Q/i)).toBeInTheDocument();
    expect(screen.getByText(/2 claims touched · 1 contradicted/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Nvidia dossier →' }))
      .toHaveAttribute('href', '/wiki/workspace?page=wiki-first-principles');
    expect(screen.getByText('c1')).toBeInTheDocument();
    expect(screen.getByText('partial → conflicted')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Integration retains pricing power.' })).toBeInTheDocument();
    expect(screen.getByText('EDGAR · NVDA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Still hold' }));
    await waitFor(() => expect(recordClaimCheckIn).toHaveBeenCalledWith({
      pageId: 'wiki-first-principles', claimId: 'c1', action: 'reaffirmed', revisedText: ''
    }));
    expect(await screen.findByText(/reaffirmed · 1st time/i)).toBeInTheDocument();
  });
});
