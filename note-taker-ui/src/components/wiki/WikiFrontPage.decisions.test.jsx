import React from 'react';
import { render, screen } from '@testing-library/react';
import * as router from 'react-router-dom';
import WikiFrontPage from './WikiFrontPage';
import { listWikiPages } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  listWikiPages: jest.fn()
}));
jest.mock('../../utils/wikiFeatureFlags', () => ({
  wikiPagePath: pageId => `/wiki/workspace?page=${pageId}`,
  wikiReadPath: pageId => `/wiki/read/${pageId}`
}));
jest.mock('./WikiBuildPageComposer', () => () => null);
jest.mock('./WikiRepoCreateComposer', () => () => null);
jest.mock('./WikiCompanyDossierComposer', () => () => null);
jest.mock('./WikiFrontPageGraphMotif', () => () => null);
jest.mock('./WikiMovementReturnSurface', () => () => null);
jest.mock('../agent/ThoughtPartnerPanel', () => () => null);
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
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps Decisions reachable through the existing workspace without making them the collection', async () => {
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 1, name: 'Wiki' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inference economics' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decisions index fixture' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Full workspace' }))
      .toHaveAttribute('href', '/wiki/workspace?view=list');
    expect(screen.getByRole('link', { name: 'Map & disagreements' }))
      .toHaveAttribute('href', '/wiki/workspace?view=graph');
  });

  it('keeps workspace reachable when the Wiki corpus is empty', async () => {
    localStorage.setItem('noeis.wikiOnboardingComplete', 'true');
    listWikiPages.mockResolvedValue([]);

    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 1, name: 'Wiki' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Full workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Decisions index fixture' })).not.toBeInTheDocument();
  });
});
