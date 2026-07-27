import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiFrontPage from './WikiFrontPage';
import { listWikiPages } from '../../api/wiki';
import { getDailyLoop } from '../../api/dailyLoop';

jest.mock('../../api/wiki', () => ({ listWikiPages: jest.fn() }));
jest.mock('../../api/dailyLoop', () => ({
  getDailyLoop: jest.fn(),
  recordClaimCheckIn: jest.fn(),
  armReadingWatch: jest.fn(),
  disarmWatcher: jest.fn()
}));
jest.mock('../../utils/wikiFeatureFlags', () => ({
  wikiPagePath: pageId => `/wiki/workspace?page=${pageId}`
}));
jest.mock('./WikiBuildPageComposer', () => () => null);
jest.mock('./WikiRepoCreateComposer', () => () => null);
jest.mock('./WikiCompanyDossierComposer', () => () => null);
jest.mock('./WikiFrontPageGraphMotif', () => () => null);
jest.mock('./ThisWeekInAIComposer', () => () => null, { virtual: true });
jest.mock('./WikiMovementReturnSurface', () => () => null);
jest.mock('./decisions/DecisionsIndex', () => () => (
  <section aria-label="Decisions index fixture">Decisions index fixture</section>
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

describe('WikiFrontPage Decisions return surface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    jest.spyOn(router, 'useNavigate').mockReturnValue(jest.fn());
    listWikiPages.mockResolvedValue([page]);
    getDailyLoop.mockResolvedValue({
      briefing: {
        generatedAt: '2026-08-07T13:00:00.000Z',
        summary: 'Your Wiki is current.',
        counts: { newSources: 0, recentlyUpdatedPages: 1, driftingPages: 2 },
        recentlyUpdatedPages: [page],
        driftingPages: [{ _id: 'drift-1' }, { _id: 'drift-2' }],
        totalPages: 1
      }
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps Decisions inside the Wiki return loop and preserves the existing Review destination', async () => {
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 1, name: 'Inference economics' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decisions index fixture' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review (2)' }))
      .toHaveAttribute('href', '/wiki/workspace?view=graph');

    const toggle = screen.getByRole('button', { name: 'Decisions' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(screen.getByRole('region', { name: 'Decisions index fixture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide decisions' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Hide decisions' }));
    expect(screen.queryByRole('region', { name: 'Decisions index fixture' })).not.toBeInTheDocument();
  });

  it('mounts the Decisions index when the Wiki corpus is empty', async () => {
    localStorage.setItem('noeis.wikiOnboardingComplete', 'true');
    listWikiPages.mockResolvedValue([]);
    getDailyLoop.mockResolvedValue({ briefing: { counts: {}, totalPages: 0 } });

    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', {
      level: 1,
      name: /Nothing here yet/
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Decisions' }));

    expect(screen.getByRole('region', { name: 'Decisions index fixture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide decisions' }))
      .toHaveAttribute('aria-expanded', 'true');
  });
});
