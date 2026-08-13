import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';
import OnboardingBuildBanner from './OnboardingBuildBanner';
import { setActiveBuild } from './activeBuild';
import { getWikiPageBuildStatus } from '../api/wiki';

jest.mock('../api/wiki', () => ({
  getWikiPageBuildStatus: jest.fn()
}));

const mockNavigate = jest.fn();

const renderBanner = () => render(
  <MemoryRouter>
    <OnboardingBuildBanner />
  </MemoryRouter>
);

describe('OnboardingBuildBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    jest.spyOn(router, 'useNavigate').mockReturnValue(mockNavigate);
  });

  it('renders nothing when no build is in flight', () => {
    const { container } = renderBanner();
    expect(container).toBeEmptyDOMElement();
    expect(getWikiPageBuildStatus).not.toHaveBeenCalled();
  });

  it('offers a way into the page while the build is still running', async () => {
    getWikiPageBuildStatus.mockResolvedValue({ status: 'maintaining', error: '', errorCode: '', page: null });
    setActiveBuild({ pageId: 'page-9', title: 'Loss Aversion' });

    renderBanner();

    expect(await screen.findByText(/Building “Loss Aversion”/)).toBeInTheDocument();
    // Never trap the user in waiting.
    fireEvent.click(screen.getByRole('button', { name: 'Take me there now' }));
    expect(mockNavigate).toHaveBeenCalled();
  });

  it('announces a finished build and clears the handoff on the way in', async () => {
    getWikiPageBuildStatus.mockResolvedValue({ status: 'ready', error: '', errorCode: '', page: {} });
    setActiveBuild({ pageId: 'page-9', title: 'Loss Aversion' });

    renderBanner();

    expect(await screen.findByText('Loss Aversion is ready.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Take me there' }));
    await waitFor(() => expect(sessionStorage.getItem('noeis.onboarding.activeBuild.v1')).toBeNull());
  });

  it('ends on an honest message when the build fails rather than pulsing forever', async () => {
    getWikiPageBuildStatus.mockResolvedValue({
      status: 'error',
      error: 'The draft did not pass the quality bar.',
      errorCode: 'WIKI_CANDIDATE_REJECTED',
      page: null
    });
    setActiveBuild({ pageId: 'page-9', title: 'Loss Aversion' });

    renderBanner();

    expect(await screen.findByText(/I hit a wall building/)).toBeInTheDocument();
    expect(screen.getByText('The draft did not pass the quality bar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open the page' })).toBeInTheDocument();
  });

  it('can be dismissed outright', async () => {
    getWikiPageBuildStatus.mockResolvedValue({ status: 'maintaining', error: '', errorCode: '', page: null });
    setActiveBuild({ pageId: 'page-9', title: 'Loss Aversion' });

    renderBanner();

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss build progress' }));
    await waitFor(() => expect(screen.queryByText(/Building/)).not.toBeInTheDocument());
  });
});
