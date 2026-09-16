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
jest.mock('./decisions/DecisionsIndex', () => () => null);
jest.mock('../agent/AgentContextShell', () => ({ children }) => <>{children}</>);
jest.mock('../agent/ThoughtPartnerPanel', () => () => null);
jest.mock('../../layout/RightDrawer', () => ({ children }) => <>{children}</>);

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
    listWikiPages.mockResolvedValue([page]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('keeps map and workspace reachable without inventing a work-is-ready lead', async () => {
    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 1, name: 'Wiki' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inference economics' })).toHaveAttribute('href', '/wiki/read/64f100000000000000000001');
    expect(screen.getByRole('link', { name: 'Map & disagreements' }))
      .toHaveAttribute('href', '/wiki/workspace?view=graph');
    expect(screen.getByRole('link', { name: 'Full workspace' }))
      .toHaveAttribute('href', '/wiki/workspace?view=list');
    expect(screen.queryByText(/needs your review/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Current Wiki briefing')).not.toBeInTheDocument();
  });

  it('keeps workspace reachable for an empty Wiki corpus', async () => {
    localStorage.setItem('noeis.wikiOnboardingComplete', 'true');
    listWikiPages.mockResolvedValueOnce([]);

    render(<router.MemoryRouter><WikiFrontPage /></router.MemoryRouter>);

    expect(await screen.findByRole('heading', { level: 1, name: 'Wiki' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Full workspace' })).toBeInTheDocument();
  });
});
