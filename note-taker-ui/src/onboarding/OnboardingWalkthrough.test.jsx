import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import OnboardingWalkthrough from './OnboardingWalkthrough';
import { startWalkthrough, isWalkthroughRunning } from './walkthroughState';
import { setActiveBuild } from './activeBuild';
import { getWikiPageBuildStatus } from '../api/wiki';
import { WALKTHROUGH_STOPS } from './walkthroughConfig';

jest.mock('../api/wiki', () => ({
  getWikiPageBuildStatus: jest.fn()
}));

jest.mock('../tour/useTourSignal', () => ({
  __esModule: true,
  default: () => jest.fn()
}));

const navigate = jest.fn();

const renderWalkthrough = () => render(
  <MemoryRouter>
    <OnboardingWalkthrough />
  </MemoryRouter>
);

describe('OnboardingWalkthrough', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    getWikiPageBuildStatus.mockResolvedValue({ status: 'maintaining', error: '', errorCode: '', page: null });
  });

  it('renders nothing until it is started', () => {
    const { container } = renderWalkthrough();
    expect(container).toBeEmptyDOMElement();
  });

  it('walks the stops in order and ends on home', async () => {
    setActiveBuild({ pageId: 'page-1', title: 'Survivorship Bias' });
    startWalkthrough();
    renderWalkthrough();

    for (let i = 0; i < WALKTHROUGH_STOPS.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect(await screen.findByText(WALKTHROUGH_STOPS[i].title)).toBeInTheDocument();
      expect(screen.getByText(`${i + 1} of ${WALKTHROUGH_STOPS.length}`)).toBeInTheDocument();
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(navigate).toHaveBeenCalledWith(WALKTHROUGH_STOPS[i].route));
      fireEvent.click(screen.getByRole('button', { name: i === WALKTHROUGH_STOPS.length - 1 ? 'Done' : 'Next' }));
    }

    // The last stop is the Paper — leave them there rather than bouncing away.
    await waitFor(() => expect(isWalkthroughRunning()).toBe(false));
  });

  it('reports the live build without blocking on it', async () => {
    setActiveBuild({ pageId: 'page-1', title: 'Survivorship Bias' });
    startWalkthrough();
    renderWalkthrough();

    expect(await screen.findByText(/Still building “Survivorship Bias”/)).toBeInTheDocument();
    // The user is never stuck watching it.
    expect(screen.getByRole('button', { name: 'Take me there now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });

  it('offers the finished page as soon as the build lands', async () => {
    getWikiPageBuildStatus.mockResolvedValue({ status: 'ready', error: '', errorCode: '', page: { sourceRefs: [{}] } });
    setActiveBuild({ pageId: 'page-1', title: 'Survivorship Bias' });
    startWalkthrough();
    renderWalkthrough();

    expect(await screen.findByText('Survivorship Bias is ready.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show me my page' }));
    await waitFor(() => expect(isWalkthroughRunning()).toBe(false));
  });

  it('says so plainly when the build fails instead of ending on nothing', async () => {
    getWikiPageBuildStatus.mockResolvedValue({
      status: 'error',
      error: 'the draft did not pass the quality bar.',
      errorCode: 'WIKI_CANDIDATE_REJECTED',
      page: null
    });
    setActiveBuild({ pageId: 'page-1', title: 'Survivorship Bias' });
    startWalkthrough();
    renderWalkthrough();

    expect(await screen.findByText(/I hit a wall on your page/)).toBeInTheDocument();
  });

  it('speaks about the user\'s own material once the build reports sources', async () => {
    getWikiPageBuildStatus.mockResolvedValue({
      status: 'ready', error: '', errorCode: '', page: { sourceRefs: [{}, {}] }
    });
    setActiveBuild({ pageId: 'page-1', title: 'Survivorship Bias' });
    startWalkthrough();
    renderWalkthrough();

    expect(await screen.findByText(/The sources I just read for your page are in here/)).toBeInTheDocument();
  });

  it('can be skipped outright at the first stop', async () => {
    setActiveBuild({ pageId: 'page-1', title: 'Survivorship Bias' });
    startWalkthrough();
    renderWalkthrough();

    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(isWalkthroughRunning()).toBe(false));
  });
});
