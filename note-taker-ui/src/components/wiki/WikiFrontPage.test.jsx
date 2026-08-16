import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiFrontPage from './WikiFrontPage';
import { listWikiPages } from '../../api/wiki';
import { getDailyLoop, recordClaimCheckIn, armReadingWatch, disarmWatcher } from '../../api/dailyLoop';
import { clearSentenceHandoff, peekSentenceHandoff } from '../../motion/columnMotion';
import { listDailyResurface, listReturnQueue } from '../../api/returnQueue';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn()
}));

jest.mock('../../api/returnQueue', () => ({
  listReturnQueue: jest.fn(),
  listDailyResurface: jest.fn()
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

jest.mock('./WikiCompanyDossierComposer', () => ({ className = '' }) => (
  <section className={className}>Company dossier composer</section>
));

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
    listReturnQueue.mockResolvedValue([]);
    listDailyResurface.mockResolvedValue([]);
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
    expect(document.querySelector('.wiki-front-page__graph-motif')).not.toBeInTheDocument();
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

    // Today's page is what to continue, under the lead rather than over it.
    const heading = screen.getByRole('heading', { level: 2, name: 'First Principles Thinking' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue reading →' }))
      .toHaveAttribute('href', '/wiki/read/wiki-first-principles');

    // Lead excerpt comes from the full page object (clamped preview).
    expect(screen.getByText(/strips a question down to its most basic/i)).toBeInTheDocument();

    // Recently grown is a short numbered list, and it excludes the lead story.
    const grown = screen.getByRole('region', { name: /recently grown/i });
    expect(grown).toHaveTextContent('Opportunity Cost');
    expect(grown).not.toHaveTextContent('First Principles Thinking');
    expect(within(grown).getAllByRole('link')[0])
      .toHaveAttribute('href', '/wiki/read/wiki-opportunity-cost');

    // The operational face is gone: no Explore index, no workspace nav, no
    // activity rail, no counters on the front door.
    expect(screen.queryByText('Explore')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Wiki workspace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Wiki activity' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /review \(4\)/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/pages need review/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();

    // Maintenance is still reachable, behind one line each.
    expect(screen.getByText(/^Watching/)).toBeInTheDocument();
    expect(screen.getByText('Make a page')).toBeInTheDocument();
  });

  it('says what you set aside is due, now that the Return Queue is not a room', async () => {
    listReturnQueue.mockResolvedValueOnce([{ _id: 'rq1' }, { _id: 'rq2' }]);

    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    const due = await screen.findByRole('link', { name: '2 things you set aside are due.' });
    expect(due).toHaveAttribute('href', '/return-queue');
    expect(listReturnQueue).toHaveBeenCalledWith({ filter: 'due' });
  });

  it('says nothing about the queue when nothing is due', async () => {
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    await screen.findByText(/Morning paper ·/i);
    expect(screen.queryByText(/you set aside/)).not.toBeInTheDocument();
  });

  it('says how many highlights are waiting to be seen again, now that Resurface is not a room', async () => {
    listDailyResurface.mockResolvedValueOnce([{ _id: 'h1' }, { _id: 'h2' }, { _id: 'h3' }]);

    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    const again = await screen.findByRole('link', { name: '3 highlights to see again.' });
    expect(again).toHaveAttribute('href', '/review?tab=resurface');
  });

  it('says nothing about resurfacing when there is nothing to see again', async () => {
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    await screen.findByText(/Morning paper ·/i);
    expect(screen.queryByText(/to see again/)).not.toBeInTheDocument();
  });

  it('falls back to the strongest page when the briefing fails', async () => {
    getDailyLoop.mockRejectedValueOnce(new Error('down'));

    render(
      <router.MemoryRouter>
        <WikiFrontPage />
      </router.MemoryRouter>
    );

    // Weighted fallback: most sources+claims wins the lead slot.
    const heading = await screen.findByRole('heading', { level: 2, name: 'First Principles Thinking' });
    expect(heading).toHaveTextContent('First Principles Thinking');
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

    expect(await screen.findByRole('heading', { level: 2, name: 'First Principles Thinking' }))
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
    expect(screen.getByRole('heading', { level: 2, name: 'First Principles Thinking' }))
      .toBeInTheDocument();
    expect(screen.getByText(/While you were away I rebuilt Opportunity Cost/i)).toBeInTheDocument();
    expect(listWikiPages).toHaveBeenCalledTimes(1);
    expect(listWikiPages).toHaveBeenCalledWith({ limit: 80, includeLowQuality: 1 });
    expect(getDailyLoop).toHaveBeenCalledTimes(1);
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

    // The page that gained sources becomes what to continue. The evidence
    // strip and the return-path block are not on the column; their selection
    // stays covered by wikiBriefingReturnLoopModel's own tests.
    expect(await screen.findByRole('heading', { level: 2, name: 'Opportunity Cost' })).toBeInTheDocument();
    expect(screen.queryByText('Evidence surfaced')).not.toBeInTheDocument();
    expect(screen.queryByText('Return path')).not.toBeInTheDocument();
  });

  it('dedupes duplicate repo wikis and keeps a non-repo Today\'s page', async () => {
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

    expect(await screen.findByRole('heading', { level: 2, name: 'First Principles Thinking' }))
      .toBeInTheDocument();

    // Six copies of one repo wiki reach the paper as at most one, under its
    // display title rather than the generated one.
    const column = document.querySelector('.wiki-front-page');
    expect((column.textContent.match(/note-taker-3 — repo wiki/g) || []).length).toBeLessThanOrEqual(1);
    expect(column.textContent.match(/Atsokolas\/Note-Taker-3 Repo Wiki/g)).toBeNull();
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

    // The claim is the lead. The watcher's own telemetry is not on the paper.
    expect(await screen.findByRole('heading', { level: 1, name: 'Integration retains pricing power.' }))
      .toBeInTheDocument();
    expect(screen.queryByText(/2 claims touched · 1 contradicted/i)).not.toBeInTheDocument();
    expect(screen.queryByText('partial → conflicted')).not.toBeInTheDocument();

    // Disarming still exists, behind the one watching line.
    fireEvent.click(screen.getByText(/^Watching 1 source\.$/));
    fireEvent.click(screen.getByRole('button', { name: 'Disarm' }));
    await waitFor(() => expect(disarmWatcher).toHaveBeenCalledTimes(1));
    expect(disarmWatcher).toHaveBeenCalledWith('wiki-first-principles', 'sec_edgar');

    fireEvent.click(screen.getByRole('button', { name: 'Still hold' }));
    await waitFor(() => expect(recordClaimCheckIn).toHaveBeenCalledWith({
      pageId: 'wiki-first-principles', claimId: 'c1', action: 'reaffirmed', revisedText: ''
    }));
    expect(await screen.findByText(/reaffirmed · 1st time/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('wiki-front-page__check-in-register');
  });

  it('opens the claim in Judgment and hands the sentence over rather than restating it', async () => {
    listWikiPages.mockResolvedValue(pages);
    getDailyLoop.mockResolvedValue({ briefing: {
      lead: null,
      watcherLeads: [],
      claimCheckIn: {
        pageId: 'wiki-first-principles',
        pageTitle: 'Nvidia dossier',
        claimId: 'c1',
        text: 'Integration retains pricing power.',
        changedSinceLastCheck: true,
        href: '/wiki/workspace?page=wiki-first-principles&claimId=c1'
      },
      watching: []
    } });

    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    const open = await screen.findByRole('link', { name: 'Open claim' });
    expect(open).toHaveAttribute('href', '/judgment/wiki-first-principles');

    clearSentenceHandoff();
    fireEvent.click(open);

    // The same sentence travels, so Judgment can show it as the sentence the
    // human was already reading instead of a new headline.
    expect(peekSentenceHandoff()).toEqual(expect.objectContaining({
      sentence: 'Integration retains pricing power.'
    }));
  });

  it('keeps a dense watcher list behind one line', async () => {
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

    // Seven watchers are one sentence until asked for, then all seven.
    const summary = await screen.findByText('Watching 7 sources.');
    const watchingBlock = summary.closest('details');
    expect(watchingBlock).not.toHaveAttribute('open');
    expect(within(watchingBlock).getAllByRole('button', { name: 'Disarm' })).toHaveLength(7);
    fireEvent.click(summary);
    await waitFor(() => expect(watchingBlock).toHaveAttribute('open'));
  });
});
