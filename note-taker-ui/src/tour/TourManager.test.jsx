import { fireEvent, render, screen } from '@testing-library/react';
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

