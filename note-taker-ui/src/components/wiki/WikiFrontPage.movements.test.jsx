import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiFrontPage from './WikiFrontPage';
import { listWikiPages } from '../../api/wiki';
import { getDailyLoop } from '../../api/dailyLoop';
import useLibraryRoom from '../../hooks/useLibraryRoom';

/* Movement return stays behind operations. Morning Paper is not a second hub. */
jest.mock('./WeeklyDigest', () => () => null);

jest.mock('../../api/knowledgeMovements', () => ({
  getWeeklyMovements: jest.fn().mockResolvedValue({ groups: [], quiet: true })
}));
jest.mock('../../api/wiki', () => ({ listWikiPages: jest.fn() }));
jest.mock('../../hooks/useLibraryRoom', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    loading: false,
    error: '',
    feedTopics: [],
    folders: [],
    shelfCounts: {},
    piles: { later: [], setAside: [] },
    sources: [],
    coverage: null,
    counts: {},
    nextCursor: null,
    hasMore: false,
    refresh: jest.fn()
  }))
}));
jest.mock('../../api/dailyLoop', () => ({
  getDailyLoop: jest.fn(),
  armReadingWatch: jest.fn(),
  disarmWatcher: jest.fn(),
  recordClaimCheckIn: jest.fn(),
  recordClaimFalsifiability: jest.fn(),
  recordClaimVerdict: jest.fn(),
  disposeConsequence: jest.fn()
}));
jest.mock('../../utils/wikiFeatureFlags', () => ({
  wikiPagePath: pageId => `/wiki/workspace?page=${pageId}`,
  wikiReadPath: pageId => `/wiki/read/${pageId}`
}));
jest.mock('./WikiBuildPageComposer', () => () => null);
jest.mock('./WikiRepoCreateComposer', () => () => null);
jest.mock('./WikiCompanyDossierComposer', () => () => null);
jest.mock('./WikiFrontPageGraphMotif', () => () => null);
jest.mock('./decisions/DecisionsIndex', () => () => null);
jest.mock('../agent/AgentContextShell', () => ({ children }) => <>{children}</>);
jest.mock('../agent/ThoughtPartnerPanel', () => () => null);
jest.mock('../../layout/RightDrawer', () => ({ children }) => <>{children}</>);
jest.mock('./WikiMovementReturnSurface', () => ({ onPresenceChange }) => (
  <section aria-label="What changed return surface">
    <button type="button" onClick={() => onPresenceChange(true)}>Movement present</button>
  </section>
));

const page = {
  _id: '64f100000000000000000001',
  title: 'Inference economics',
  pageType: 'topic',
  summary: 'A maintained Wiki page about the economics of inference.',
  sourceRefs: [{ _id: '64f100000000000000000002' }],
  claims: [{ _id: 'claim-1' }],
  updatedAt: '2026-08-07T12:00:00.000Z'
};

describe('WikiFrontPage movement return surface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    jest.spyOn(router, 'useNavigate').mockReturnValue(jest.fn());
    useLibraryRoom.mockReturnValue({
      loading: false,
      error: '',
      feedTopics: [],
      folders: [],
      shelfCounts: {},
      piles: { later: [], setAside: [] },
      sources: [],
      coverage: null,
      counts: {},
      nextCursor: null,
      hasMore: false,
      refresh: jest.fn()
    });
    listWikiPages.mockResolvedValue([page]);
    getDailyLoop.mockResolvedValue({
      briefing: {
        generatedAt: '2026-08-07T13:00:00.000Z',
        summary: 'A generic fallback briefing should yield to a real movement.',
        counts: { newSources: 0, recentlyUpdatedPages: 1, driftingPages: 0 },
        recentlyUpdatedPages: [page],
        driftingPages: [],
        totalPages: 1
      }
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('opens operations when a movement is present, without inventing a work-is-ready lead', async () => {
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByText(/generic fallback briefing/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'What changed return surface' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Movement present' }));

    await waitFor(() => {
      expect(screen.getByText('Review and system activity').closest('details')).toHaveAttribute('open');
    });
    expect(screen.getByText(/generic fallback briefing/i)).toBeInTheDocument();
    expect(screen.queryByText(/needs your review/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Your living wikis' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Inference economics' }).length).toBeGreaterThan(0);
  });

  it('keeps the movement return surface visible for an empty Wiki corpus', async () => {
    localStorage.setItem('noeis.wikiOnboardingComplete', 'true');
    listWikiPages.mockResolvedValueOnce([]);

    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { name: /No news yet/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'What changed return surface' })).toBeInTheDocument();
  });
});
