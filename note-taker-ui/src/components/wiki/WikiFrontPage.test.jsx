import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiFrontPage from './WikiFrontPage';
import { listWikiPages } from '../../api/wiki';
import { getDailyLoop, armReadingWatch, disarmWatcher } from '../../api/dailyLoop';

/* Morning Paper is close-or-silence on this page, not a second hub. */
jest.mock('./WeeklyDigest', () => () => null);

jest.mock('../../api/knowledgeMovements', () => ({
  __esModule: true,
  default: jest.fn(),
  getKnowledgeMovements: jest.fn(),
  getWeeklyMovements: jest.fn().mockResolvedValue({ weekStart: '', weekEnd: '', totals: {}, total: 0, groups: [], quiet: true })
}));

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn()
}));

jest.mock('../../api/dailyLoop', () => ({
  getDailyLoop: jest.fn(),
  armReadingWatch: jest.fn(),
  disarmWatcher: jest.fn()
}));

jest.mock('./WikiCreationComposer', () => () => (
  <section aria-label="Create a wiki">
    <button type="button">Wiki</button>
    <button type="button">Repo wiki</button>
    <button type="button">Investment dossier</button>
  </section>
));

jest.mock('./decisions/DecisionsIndex', () => () => (
  <section aria-label="Decisions index" />
));

jest.mock('../agent/ThoughtPartnerPanel', () => ({ title = 'Thought partner' }) => (
  <section aria-label={`${title} panel`}>Thought partner</section>
));

jest.mock('./WikiMovementReturnSurface', () => {
  const MockReact = require('react');
  return ({ onPresenceChange }) => {
    MockReact.useEffect(() => onPresenceChange?.(false), [onPresenceChange]);
    return <section aria-label="What changed return surface" />;
  };
});

jest.mock('../../utils/wikiFeatureFlags', () => ({
  wikiPagePath: (pageId) => `/wiki/workspace?page=${pageId}`,
  wikiReadPath: (pageId) => `/wiki/read/${pageId}`
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

describe('WikiFrontPage canonical titles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    jest.spyOn(router, 'useNavigate').mockReturnValue(jest.fn());
    getDailyLoop.mockResolvedValue({ briefing: { ...briefing, recentlyUpdatedPages: [] } });
  });

  const withDuplicates = () => listWikiPages.mockResolvedValueOnce([
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

  it('prints only the grounded canonical page for a duplicated title', async () => {
    withDuplicates();
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    const table = await screen.findByRole('table', { name: 'Living Wiki pages' });
    // The grounded copy is the one that reaches the index, not the newest.
    expect(within(table).getAllByRole('link', { name: 'Opportunity Cost' })).toHaveLength(1);
    expect(within(table).getByRole('link', { name: 'Opportunity Cost' }))
      .toHaveAttribute('href', '/wiki/read/wiki-opportunity-cost');

    expect(within(table).queryByText(/more with this title|other copy/i)).not.toBeInTheDocument();
  });

  it('counts the wikis it shows, not every copy of a title', async () => {
    withDuplicates();
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    await screen.findByRole('table', { name: 'Living Wiki pages' });
    const nav = document.querySelector('.wiki-living-nav');
    expect(within(nav).getByText('All wikis').nextSibling).toHaveTextContent('2');
    const mobileToggle = within(nav).getByRole('button', { name: /browse wikis/i });
    expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(mobileToggle);
    expect(mobileToggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps review triage honest while the daily briefing is unavailable', async () => {
    listWikiPages.mockResolvedValueOnce([{
      ...pages[0],
      aiState: { candidateStatus: 'awaiting_maintenance_acceptance' },
      qualityReview: { reasons: [{ code: 'uncited_claim' }] }
    }, pages[1]]);
    getDailyLoop.mockRejectedValueOnce(new Error('briefing unavailable'));
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    const table = await screen.findByRole('table', { name: 'Living Wiki pages' });
    fireEvent.click(screen.getByRole('button', { name: /Needs review 1/i }));
    expect(screen.getAllByText(/worth your attention/i)).toHaveLength(1);
    expect(within(table).getAllByText('Material proposed change awaiting review').length).toBeGreaterThan(0);
    expect(screen.queryByText('Your accepted pages are current.')).not.toBeInTheDocument();
  });
});

describe('WikiFrontPage (AT-394)', () => {
  let navigate;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    navigate = jest.fn();
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    listWikiPages.mockResolvedValue(pages);
    getDailyLoop.mockResolvedValue({ briefing });
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
    expect(screen.getByRole('status')).toHaveTextContent(/opening your living knowledge/i);
    expect(document.querySelector('.room-shelf__count')).toBeNull();
    expect(screen.queryByText('Pages')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, hidden: true })).toHaveTextContent('Your Wiki');
  });

  it('opens accepted pages without waiting for a slow Daily Loop briefing', async () => {
    getDailyLoop.mockReturnValueOnce(new Promise(() => {}));

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    expect(await screen.findByRole('table', { name: 'Living Wiki pages' })).toBeInTheDocument();
    expect(within(document.querySelector('.wiki-living-table')).getByRole('link', { name: 'First Principles Thinking' })).toBeInTheDocument();
    expect(screen.queryByText(/opening your living knowledge/i)).not.toBeInTheDocument();
  });

  it('shares the cold page-index request across the development Strict Mode replay', async () => {
    let resolvePages;
    listWikiPages.mockReturnValueOnce(new Promise((resolve) => {
      resolvePages = resolve;
    }));

    render(
      <React.StrictMode>
        <router.MemoryRouter>
          <WikiFrontPage />
        </router.MemoryRouter>
      </React.StrictMode>
    );

    expect(listWikiPages).toHaveBeenCalledTimes(1);
    await act(async () => resolvePages(pages));
    expect(await screen.findByRole('table', { name: 'Living Wiki pages' })).toBeInTheDocument();
  });

  it('renders the living Wiki index with filters and grounded rows, and no second agent', async () => {
    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    // The agent's lead sentence arrives as complete visible text. It is not
    // duplicated as hidden DOM text and never renders as a partial word stream.
    const leadText = await screen.findByText(/While you were away I rebuilt Opportunity Cost/i);
    expect(listWikiPages).toHaveBeenCalledTimes(1);
    expect(listWikiPages).toHaveBeenCalledWith({ limit: 500, includeLowQuality: 1, summary: 1 });
    expect(leadText.closest('.wiki-front-page__lead-text')).toHaveTextContent(/\.$/);
    expect(leadText.closest('.wiki-front-page__lead-text')).not.toHaveAttribute('aria-label');
    expect(document.body.textContent.match(/While you were away I rebuilt Opportunity Cost/g)).toHaveLength(1);

    // Masthead with date eyebrow.
    expect(screen.getByText(/Your Wiki ·/i)).toBeInTheDocument();

    // The product identity is the single h1; accepted pages remain durable rows.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Your living wikis');
    // The Curator pane is gone: it was a second agent, labelled "Persistent
    // agent", sitting beside the rail that is the agent in every other room.
    // What it could do that the rail cannot — build a page, connect a repo —
    // is in the column, behind one disclosure.
    expect(screen.queryByRole('complementary', { name: 'Wiki Curator' })).not.toBeInTheDocument();
    expect(document.querySelector('.wiki-front-page__making summary')).toHaveTextContent('Build a wiki');
    expect(screen.getByRole('button', { name: 'Investment dossier' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All wikis 3/i })).toHaveAttribute('aria-pressed', 'true');

    const livingTable = screen.getByRole('table', { name: 'Living Wiki pages' });
    expect(livingTable.querySelector('.wiki-living-row__title > span')).not.toBeInTheDocument();
    expect(within(livingTable).getByRole('link', { name: 'First Principles Thinking' }))
      .toHaveAttribute('href', '/wiki/read/wiki-first-principles');
    expect(within(livingTable).getByRole('link', { name: 'Margin of Safety' }))
      .toHaveAttribute('href', '/wiki/read/wiki-margin-of-safety');
    expect(within(livingTable).getByText('2 Library sources')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search your wikis' }), {
      target: { value: 'Margin' }
    });
    expect(within(livingTable).getByRole('link', { name: 'Margin of Safety' })).toBeInTheDocument();
    expect(within(livingTable).queryByRole('link', { name: 'Opportunity Cost' })).not.toBeInTheDocument();

    // Workspace destinations are legible secondary nav near the top.
    const operations = document.querySelector('.wiki-front-page__operations');
    expect(operations).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Review and system activity'));
    const workspaceNav = screen.getByRole('navigation', { name: 'Wiki workspace' });
    expect(workspaceNav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review \(4\)/i }))
      .toHaveAttribute('href', '/wiki/workspace?view=graph');
    expect(screen.getAllByRole('link', { name: 'Knowledge map' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Add reading feed')).toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();

    // No review queue / counters dumped on the front door.
    expect(screen.queryByText(/pages need review/i)).not.toBeInTheDocument();
  });

  it('does not surface internal safety boilerplate as the Wiki briefing', async () => {
    getDailyLoop.mockResolvedValueOnce({
      briefing: {
        ...briefing,
        summary: 'User Safety: safe.',
        counts: { ...briefing.counts, driftingPages: 4 }
      }
    });

    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    const heading = await screen.findByRole('heading', { name: 'Your living wikis' });
    expect(heading).toBeInTheDocument();
    expect(screen.queryByLabelText('Current Wiki briefing')).not.toBeInTheDocument();
    expect(screen.queryByText(/ready for review/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/needs your review/i)).not.toBeInTheDocument();
  });

  it('groups general wikis, repository wikis, and investment dossiers without presenting proposals as accepted knowledge', async () => {
    const repoPage = {
      _id: 'repo-wiki',
      title: 'atsokolas/note-taker-3 Repo Wiki',
      pageType: 'repo',
      sourceRefs: [{ _id: 'repo-source' }],
      externalWatches: { githubRepo: { owner: 'atsokolas', repo: 'note-taker-3' } }
    };
    const candidatePage = {
      ...pages[0],
      aiState: { candidateStatus: 'awaiting_maintenance_acceptance' }
    };
    const dossierPage = {
      _id: 'costco-dossier',
      title: 'Costco investment dossier',
      pageType: 'entity',
      investmentDossier: { version: 2 },
      sourceRefs: [{ _id: 'costco-source' }]
    };
    listWikiPages.mockResolvedValueOnce([candidatePage, repoPage, dossierPage, pages[1]]);
    getDailyLoop.mockResolvedValueOnce({ briefing: { ...briefing, recentlyUpdatedPages: [] } });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    const table = await screen.findByRole('table', { name: 'Living Wiki pages' });
    expect(within(table).getByText('Review available')).toBeInTheDocument();
    expect(within(table).queryByText(/accepted/i)).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /General wikis 2/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Repository wikis 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Investment dossiers 1/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Repository wikis 1/i }));
    expect(within(table).getByRole('link', { name: 'note-taker-3 — repo wiki' })).toBeInTheDocument();
    expect(within(table).getByText('Repo wiki')).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'First Principles Thinking' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Investment dossiers 1/i }));
    expect(within(table).getByRole('link', { name: 'Costco investment dossier' })).toBeInTheDocument();
    expect(within(table).getByText('Investment dossier')).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'note-taker-3 — repo wiki' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Needs review 1/i }));
    expect(within(table).getByRole('link', { name: 'First Principles Thinking' })).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'note-taker-3 — repo wiki' })).not.toBeInTheDocument();
  });

  it('opens the dedicated investment dossier collection from its stable URL', async () => {
    listWikiPages.mockResolvedValueOnce([
      pages[0],
      {
        _id: 'costco-dossier',
        title: 'Costco investment dossier',
        pageType: 'entity',
        investmentDossier: { version: 2 },
        sourceRefs: [{ _id: 'costco-source' }]
      }
    ]);
    getDailyLoop.mockResolvedValueOnce({ briefing: { ...briefing, recentlyUpdatedPages: [] } });

    render(
      <router.MemoryRouter>
        <WikiFrontPage initialKind="investment" />
      </router.MemoryRouter>
    );

    const table = await screen.findByRole('table', { name: 'Living Wiki pages' });
    expect(screen.getByRole('button', { name: /Investment dossiers 1/i })).toHaveAttribute('aria-pressed', 'true');
    expect(within(table).getByRole('link', { name: 'Costco investment dossier' })).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'First Principles Thinking' })).not.toBeInTheDocument();
  });

  it('falls back to the strongest page when the briefing fails', async () => {
    getDailyLoop.mockRejectedValueOnce(new Error('down'));

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    const heading = await screen.findByRole('heading', { level: 1, name: 'Your living wikis' });
    expect(within(document.querySelector('.wiki-living-table')).getByRole('link', { name: 'First Principles Thinking' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(/current change signals could not be refreshed/i);
  });

  it('opens the onboarding arc when the corpus is empty and onboarding is incomplete', async () => {
    listWikiPages.mockResolvedValueOnce([]);
    getDailyLoop.mockResolvedValueOnce({ briefing: { ...briefing, recentlyUpdatedPages: [], totalPages: 0 } });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    // Redirecting is FirstRunGate's job now (it fires wherever the user lands, not
    // only here). This page's remaining duty is to not flash an empty front page
    // while that happens.
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
    expect(screen.getByRole('region', { name: 'Create a wiki' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Investment dossier' })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { level: 1, name: 'Your living wikis' }))
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
    expect(screen.getByRole('heading', { level: 1, name: 'Your living wikis' }))
      .toBeInTheDocument();
    expect(document.querySelector('.room-shelf__count')).toHaveTextContent(String(pages.length));
    expect(screen.getByText(/While you were away I rebuilt Opportunity Cost/i)).toBeInTheDocument();
    expect(listWikiPages).toHaveBeenCalledTimes(1);
    expect(listWikiPages).toHaveBeenCalledWith({ limit: 500, includeLowQuality: 1, summary: 1 });
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
        href: '/wiki/read/wiki-opportunity-cost',
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

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your living wikis');
    expect(screen.getByRole('heading', { level: 2, name: 'Changed by your Library' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /overnight briefing notes/i })).not.toBeInTheDocument();
    expect(screen.getByText('Evidence surfaced')).toBeInTheDocument();
    expect(screen.getByText('2 new sources — Tradeoff note, Capital allocation note')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Opportunity Cost' })[0])
      .toHaveAttribute('href', '/wiki/read/wiki-opportunity-cost');
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

    expect(await screen.findByRole('heading', { level: 1, name: 'Your living wikis' }))
      .toBeInTheDocument();

    const livingTable = screen.getByRole('table', { name: 'Living Wiki pages' });
    const repoTitles = within(livingTable).getAllByRole('link').filter((link) => /repo wiki/i.test(link.textContent));

    expect(repoTitles).toHaveLength(1);
    expect(livingTable.textContent.match(/note-taker-3 — repo wiki/g)).toHaveLength(1);
    expect(livingTable.textContent.match(/Atsokolas\/Note-Taker-3 Repo Wiki/g)).toBeNull();
    expect(within(livingTable).getByText('Margin of Safety')).toBeInTheDocument();
    expect(within(livingTable).getByText('Opportunity Cost')).toBeInTheDocument();
  });

  it('keeps every distinct returned repo Wiki reachable in the all-pages library', async () => {
    const repoPages = ['alpha-repo', 'beta-repo', 'gamma-repo'].map((repo, index) => ({
      _id: `repo-${index}`,
      title: `atsokolas/${repo} Repo Wiki`,
      pageType: 'repo',
      summary: `Repository dossier for ${repo}.`,
      sourceRefs: [{ _id: `repo-source-${index}` }],
      claims: [{ _id: `repo-claim-${index}` }],
      externalWatches: {
        githubRepo: { owner: 'atsokolas', repo, status: 'active' }
      }
    }));
    listWikiPages.mockResolvedValueOnce([...repoPages, ...pages]);
    getDailyLoop.mockResolvedValueOnce({ briefing });

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    const livingTable = await screen.findByRole('table', { name: 'Living Wiki pages' });
    repoPages.forEach((page, index) => {
      expect(within(livingTable).getByRole('link', { name: `${['alpha-repo', 'beta-repo', 'gamma-repo'][index]} — repo wiki` }))
        .toHaveAttribute('href', `/wiki/read/${page._id}`);
    });
  });

  it('names a watcher close against a held claim and keeps Still hold off the front', async () => {
    getDailyLoop.mockResolvedValueOnce({ briefing: {
      ...briefing,
      lead: {
        title: 'NVDA filed a 10-Q',
        page: { id: 'wiki-first-principles', title: 'Nvidia dossier' },
        watcherLabel: 'EDGAR',
        maintenanceStatus: 'completed',
        href: '/wiki/read/wiki-first-principles',
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

    expect(await screen.findByLabelText('Current Wiki briefing'))
      .toHaveTextContent('NVDA filed a 10-Q. It touched a claim you still hold.');
    expect(screen.getAllByText(/2 claims touched · 1 contradicted/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Open Nvidia dossier →' }))
      .toHaveAttribute('href', '/wiki/read/wiki-first-principles');
    fireEvent.click(screen.getByText('Review and system activity'));
    expect(screen.getByText('c1')).toBeInTheDocument();
    expect(screen.getByText('partial → conflicted')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Claim impact summary' })).toHaveTextContent('1 conflicted');
    expect(screen.getByText('Inspect 1 claim-level changes')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Integration retains pricing power.' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Still hold' })).not.toBeInTheDocument();
    expect(screen.getByText('EDGAR · NVDA')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Disarm' }));
    await waitFor(() => expect(disarmWatcher).toHaveBeenCalledTimes(1));
    expect(disarmWatcher).toHaveBeenCalledWith('wiki-first-principles', 'sec_edgar');
    await waitFor(() => expect(screen.queryByText('EDGAR · NVDA')).not.toBeInTheDocument());
  });

  it('keeps a dense Watching rail compact until the user expands it', async () => {
    const watching = Array.from({ length: 7 }, (_, index) => ({
      id: `watch-${index + 1}`,
      type: 'reading',
      label: `Reading · Feed ${index + 1}`,
      detail: `item ${index + 1}`,
      status: 'active',
      page: { id: pages[index % pages.length]._id, title: pages[index % pages.length].title }
    }));
    getDailyLoop.mockResolvedValueOnce({ briefing: { ...briefing, watching } });

    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByText('7 armed')).toBeInTheDocument();
    const summary = screen.getByText('2 more watchers');
    const overflow = summary.closest('details');
    expect(overflow).not.toHaveAttribute('open');
    expect(within(overflow.previousElementSibling).getAllByRole('button', { name: 'Disarm' })).toHaveLength(5);
    expect(within(overflow).getAllByRole('button', { name: 'Disarm' })).toHaveLength(2);
    fireEvent.click(summary);
    await waitFor(() => expect(overflow).toHaveAttribute('open'));
  });

  it('names two wiki closes on the briefing and does not open a second hub', async () => {
    getDailyLoop.mockResolvedValueOnce({ briefing: {
      ...briefing,
      lead: {
        eventId: 'evt-1',
        title: 'NVDA filed a 10-Q',
        page: { id: 'wiki-first-principles', title: 'Nvidia dossier' },
        href: '/wiki/read/wiki-first-principles'
      },
      watcherLeads: [
        {
          eventId: 'evt-1',
          title: 'NVDA filed a 10-Q',
          page: { id: 'wiki-first-principles', title: 'Nvidia dossier' }
        },
        {
          eventId: 'evt-2',
          title: 'Costco restated the gap',
          page: { id: 'wiki-costco', title: 'Costco' }
        }
      ]
    } });

    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByLabelText('Current Wiki briefing'))
      .toHaveTextContent('NVDA filed a 10-Q. Another close: Costco restated the gap.');
    expect(screen.queryByRole('button', { name: 'Still hold' })).not.toBeInTheDocument();
    expect(document.querySelector('.wiki-front-page__broadsheet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('paper-on-top')).not.toBeInTheDocument();
  });

  it('keeps Morning Paper silent unless an editorial close is already on the page', async () => {
    const { unmount } = render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Your living wikis' })).toBeInTheDocument();
    expect(document.querySelector('.wiki-front-page__paper-fold')).not.toBeInTheDocument();
    expect(document.querySelector('.wiki-front-page__broadsheet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('paper-on-top')).not.toBeInTheDocument();
    unmount();

    getDailyLoop.mockResolvedValueOnce({ briefing: {
      ...briefing,
      claimCheckIn: {
        pageId: 'wiki-first-principles',
        pageTitle: 'Nvidia dossier',
        claimId: 'c1',
        text: 'Integration retains pricing power.',
        changedSinceLastCheck: true,
        href: '/wiki/workspace?page=wiki-first-principles&claimId=c1'
      }
    } });
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Your living wikis' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Integration retains pricing power.' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Still hold' })).not.toBeInTheDocument();
    expect(document.querySelector('.wiki-front-page__broadsheet')).not.toBeInTheDocument();
    expect(document.querySelector('.wiki-front-page__paper-fold')).not.toBeInTheDocument();
  });

  /* A due claim is work that exists, not a close. The living briefing may
     still name a finished editorial sentence; Morning Paper does not open
     a second inbox over it. */
  describe('the lead', () => {
    it('stays silent when a claim is merely due', async () => {
      getDailyLoop.mockResolvedValueOnce({ briefing: {
        ...briefing,
        summary: '',
        claimCheckIn: {
          pageId: 'wiki-first-principles',
          pageTitle: 'Nvidia dossier',
          claimId: 'c1',
          text: 'Integration retains pricing power.',
          changedSinceLastCheck: true,
          href: '/wiki/workspace?page=wiki-first-principles&claimId=c1'
        }
      } });
      render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);
      expect(await screen.findByRole('heading', { name: 'Your living wikis' })).toBeInTheDocument();
      expect(screen.queryByText('Integration retains pricing power.')).not.toBeInTheDocument();
      expect(screen.queryByText(/Still hold/)).not.toBeInTheDocument();
      expect(document.querySelector('.wiki-front-page__broadsheet')).not.toBeInTheDocument();
    });

    it('stays silent when no claim is due', async () => {
      render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);
      expect(await screen.findByRole('heading', { name: 'Your living wikis' })).toBeInTheDocument();
      expect(screen.queryByText(/No claim is due for review this morning/)).not.toBeInTheDocument();
      expect(document.querySelector('.wiki-front-page__broadsheet')).not.toBeInTheDocument();
    });

    it('does not serve the observed repo-wiki claim as a check-in', async () => {
      getDailyLoop.mockResolvedValueOnce({ briefing: {
        ...briefing,
        summary: '',
        claimCheckIn: {
          pageId: 'wiki-repo',
          pageTitle: 'note-taker-3 — repo wiki',
          claimId: 'observed-2026-08-29',
          text: 'Use these traces before editing because repo bugs usually cross UI, API, service, persistence, and render boundaries… WikiRepoCreateComposer, createRepoWikiFromGitHub, POST /api/wiki/pages/from-github… debugging only the v…',
          changedSinceLastCheck: true,
          href: '/wiki/workspace?page=wiki-repo&claimId=observed-2026-08-29'
        }
      } });
      listWikiPages.mockResolvedValue(pages);
      render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);
      expect(await screen.findByRole('heading', { name: 'Your living wikis' })).toBeInTheDocument();
      expect(screen.queryByText(/WikiRepoCreateComposer/)).not.toBeInTheDocument();
      expect(screen.queryByText(/debugging only the v/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Still hold' })).not.toBeInTheDocument();
    });

    it('prints an honestly aged rebuild wait instead of present-tense queued signals', async () => {
      getDailyLoop.mockResolvedValueOnce({ briefing: {
        summary: 'Survivorship Bias has been waiting on a rebuild for 5 days — clear it?',
        aliveness: {
          register: 'aged',
          waitingDays: 5,
          copy: 'Survivorship Bias has been waiting on a rebuild for 5 days — clear it?'
        },
        counts: { newSources: 0, recentlyUpdatedPages: 0, driftingPages: 1 }
      } });
      listWikiPages.mockResolvedValue(pages);
      render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);
      expect(await screen.findByLabelText('Current Wiki briefing'))
        .toHaveTextContent('Survivorship Bias has been waiting on a rebuild for 5 days — clear it?');
      expect(screen.queryByText(/queued signals awaiting a rebuild/i)).not.toBeInTheDocument();
    });

    it('prints the quiet-day line when nothing new arrived', async () => {
      getDailyLoop.mockResolvedValueOnce({ briefing: {
        summary: 'Your wiki is quiet today — no new sources, updates, or drift signals in the last 24 hours.',
        aliveness: { register: 'quiet' },
        counts: { newSources: 0, recentlyUpdatedPages: 0, driftingPages: 0 }
      } });
      listWikiPages.mockResolvedValue(pages);
      render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);
      expect(await screen.findByLabelText('Current Wiki briefing'))
        .toHaveTextContent('Your wiki is quiet today — no new sources, updates, or drift signals in the last 24 hours.');
    });
  });
});

describe('Recently updated', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    jest.spyOn(router, 'useNavigate').mockReturnValue(jest.fn());
    listWikiPages.mockReset();
    getDailyLoop.mockReset();
  });

  it('does not wear a zero as a work-is-ready badge', async () => {
    listWikiPages.mockResolvedValue(pages);
    getDailyLoop.mockResolvedValue({
      briefing: { ...briefing, recentlyUpdatedPages: [], counts: { ...briefing.counts, recentlyUpdatedPages: 0 } }
    });
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Your living wikis' })).toBeInTheDocument();
    const recent = screen.getByRole('button', { name: /^Recently updated$/i });
    expect(recent).toBeInTheDocument();
    expect(recent).not.toHaveTextContent('0');
    expect(screen.getByRole('button', { name: /^Needs review$/i })).not.toHaveTextContent('0');
    expect(screen.queryByText('Recently grown')).not.toBeInTheDocument();
  });
});
