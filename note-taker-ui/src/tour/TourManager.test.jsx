import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as router from 'react-router-dom';
import TourManager from './TourManager';

jest.mock('./TourProvider', () => ({
  useTour: jest.fn()
}));

const { useTour } = require('./TourProvider');

describe('TourManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(router, 'useNavigate').mockReturnValue(jest.fn());
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/search',
      search: '?mode=semantic',
      hash: '',
      state: null,
      key: 'test'
    });
  });

  it('auto-starts for first-time visitors', () => {
    const startTour = jest.fn().mockResolvedValue(undefined);
    useTour.mockReturnValue({
      state: {
        loading: false,
        open: false,
        status: 'not_started',
        isFirstTimeVisitor: true,
        signals: {}
      },
      currentStep: null,
      currentIndex: 0,
      totalSteps: 5,
      startTour,
      resumeTour: jest.fn(),
      pauseTour: jest.fn(),
      skipTour: jest.fn(),
      nextStep: jest.fn(),
      prevStep: jest.fn(),
      refreshState: jest.fn()
    });

    render(<TourManager />);
    expect(startTour).toHaveBeenCalledTimes(1);
  });

  it('does not force first-time deep links back to Think home when the tour auto-opens', async () => {
    const navigate = jest.fn();
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/wiki/workspace',
      search: '?page=wiki-1',
      hash: '',
      state: null,
      key: 'deep-link-test'
    });
    useTour.mockReturnValue({
      state: {
        loading: false,
        open: true,
        status: 'in_progress',
        isFirstTimeVisitor: true,
        signals: {}
      },
      currentStep: {
        id: 'install_extension',
        title: 'Install the browser extension',
        body: 'Install it.',
        route: '/think?tab=home',
        targetSelector: '[data-tour-anchor="install-extension"]',
        placement: 'bottom',
        signalKey: 'extensionConnected'
      },
      currentIndex: 0,
      totalSteps: 5,
      startTour: jest.fn().mockResolvedValue(undefined),
      resumeTour: jest.fn(),
      pauseTour: jest.fn(),
      skipTour: jest.fn(),
      nextStep: jest.fn(),
      prevStep: jest.fn(),
      refreshState: jest.fn()
    });

    render(<TourManager />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    });
    expect(navigate).not.toHaveBeenCalledWith('/think?tab=home', expect.anything());
  });

  it('still navigates when the user explicitly resumes the tour from ?tour=resume', async () => {
    const navigate = jest.fn();
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    jest.spyOn(router, 'useLocation').mockReturnValue({
      pathname: '/wiki/workspace',
      search: '?page=wiki-1&tour=resume',
      hash: '',
      state: null,
      key: 'resume-test'
    });
    const resumeTour = jest.fn().mockResolvedValue(undefined);
    useTour.mockReturnValue({
      state: {
        loading: false,
        open: true,
        status: 'paused',
        isFirstTimeVisitor: false,
        signals: {}
      },
      currentStep: {
        id: 'install_extension',
        title: 'Install the browser extension',
        body: 'Install it.',
        route: '/think?tab=home',
        targetSelector: '[data-tour-anchor="install-extension"]',
        placement: 'bottom',
        signalKey: 'extensionConnected'
      },
      currentIndex: 0,
      totalSteps: 5,
      startTour: jest.fn(),
      resumeTour,
      pauseTour: jest.fn(),
      skipTour: jest.fn(),
      nextStep: jest.fn(),
      prevStep: jest.fn(),
      refreshState: jest.fn()
    });

    render(<TourManager />);

    await waitFor(() => {
      expect(resumeTour).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/think?tab=home', expect.anything());
    });
  });

  it('runs semantic demo action from tour CTA', () => {
    jest.useFakeTimers();
    const navigate = jest.fn();
    jest.spyOn(router, 'useNavigate').mockReturnValue(navigate);
    useTour.mockReturnValue({
      state: {
        loading: false,
        open: true,
        status: 'in_progress',
        isFirstTimeVisitor: false,
        signals: {
          semanticSearchUsed: false
        }
      },
      currentStep: {
        id: 'semantic_search',
        title: 'Use semantic search',
        body: 'Search by meaning.',
        route: '/search?mode=semantic',
        targetSelector: '',
        placement: 'bottom',
        signalKey: 'semanticSearchUsed',
        cta: { label: 'Run demo semantic search', action: 'run_semantic_demo' }
      },
      currentIndex: 4,
      totalSteps: 5,
      startTour: jest.fn(),
      resumeTour: jest.fn(),
      pauseTour: jest.fn(),
      skipTour: jest.fn(),
      nextStep: jest.fn(),
      prevStep: jest.fn(),
      refreshState: jest.fn().mockResolvedValue(undefined)
    });

    render(<TourManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Run demo semantic search' }));
    expect(navigate).toHaveBeenCalledWith('/search?mode=semantic&q=decision%20quality');
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
});

