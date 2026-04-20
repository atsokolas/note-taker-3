import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MarketingAnalytics from './MarketingAnalytics';
import {
  buildMarketingFunnelViewModel,
  getMarketingFunnelSeries,
  getMarketingFunnelSnapshot
} from '../api/marketingAnalytics';

jest.mock('../api/marketingAnalytics', () => {
  const actual = jest.requireActual('../api/marketingAnalytics');
  return {
    ...actual,
    getMarketingFunnelSnapshot: jest.fn(),
    getMarketingFunnelSeries: jest.fn()
  };
});

describe('Marketing analytics view model helpers', () => {
  it('derives conversion rates, leak stage, and top performers from the funnel snapshot', () => {
    const viewModel = buildMarketingFunnelViewModel({
      windowDays: 30,
      totals: {
        signupViewed: 20,
        signupStarted: 10,
        signupsCompleted: 5,
        activatedUsers: 2
      },
      byEntry: [
        {
          entry: 'ai-second-brain',
          signupViewed: 12,
          signupStarted: 7,
          signupsCompleted: 4,
          activatedUsers: 2
        },
        {
          entry: 'second-brain-app',
          signupViewed: 8,
          signupStarted: 3,
          signupsCompleted: 1,
          activatedUsers: 0
        }
      ],
      bySource: [
        {
          utmSource: 'google',
          utmMedium: 'organic',
          signupViewed: 16,
          signupStarted: 9,
          signupsCompleted: 5,
          activatedUsers: 2
        }
      ]
    });

    expect(viewModel.stageRates[0]).toMatchObject({
      key: 'view_to_start',
      numerator: 10,
      denominator: 20,
      rate: 0.5
    });
    expect(viewModel.primaryLeak.key).toBe('signup_to_activation');
    expect(viewModel.topEntry.label).toBe('Ai Second Brain');
    expect(viewModel.topEntry.viewToActivationRate).toBeCloseTo(2 / 12, 5);
    expect(viewModel.topSource.label).toBe('google / organic');
    expect(viewModel.entryRows[0].signupCompletionRate).toBeCloseTo(4 / 7, 5);
  });
});

describe('MarketingAnalytics page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders funnel totals, conversion rates, and efficiency tables', async () => {
    getMarketingFunnelSnapshot.mockResolvedValue({
      windowDays: 30,
      totals: {
        signupViewed: 12,
        signupStarted: 7,
        signupsCompleted: 4,
        activatedUsers: 2
      },
      byEntry: [
        {
          entry: 'ai-second-brain',
          signupViewed: 8,
          signupStarted: 5,
          signupsCompleted: 3,
          activatedUsers: 2
        }
      ],
      bySource: [
        {
          utmSource: 'google',
          utmMedium: 'organic',
          signupViewed: 8,
          signupStarted: 5,
          signupsCompleted: 3,
          activatedUsers: 2
        }
      ]
    });
    getMarketingFunnelSeries.mockResolvedValue({
      windowDays: 30,
      series: [
        {
          date: '2026-04-18',
          totals: {
            signupViewed: 8,
            signupStarted: 5,
            signupsCompleted: 3,
            activatedUsers: 2
          }
        }
      ]
    });

    render(<MarketingAnalytics />);

    expect(screen.getByText('Loading marketing analytics…')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText('Loading marketing analytics…')).not.toBeInTheDocument());
    expect(screen.getByText('Viewed → Started')).toBeInTheDocument();
    expect(screen.getByText('58.3%')).toBeInTheDocument();
    expect(screen.getAllByText('Ai Second Brain').length).toBeGreaterThan(0);
    expect(screen.getAllByText('google / organic').length).toBeGreaterThan(0);
    expect(screen.getByText('Primary leak')).toBeInTheDocument();
    expect(screen.getByText('Daily trend')).toBeInTheDocument();
    expect(screen.getAllByText('Apr 18').length).toBeGreaterThan(0);
  });

  it('reloads the snapshot when the reporting window changes', async () => {
    getMarketingFunnelSnapshot
      .mockResolvedValueOnce({
        windowDays: 30,
        totals: {
          signupViewed: 12,
          signupStarted: 7,
          signupsCompleted: 4,
          activatedUsers: 2
        },
        byEntry: [],
        bySource: []
      })
      .mockResolvedValueOnce({
        windowDays: 90,
        totals: {
          signupViewed: 30,
          signupStarted: 18,
          signupsCompleted: 10,
          activatedUsers: 5
        },
        byEntry: [],
        bySource: []
      });
    getMarketingFunnelSeries
      .mockResolvedValueOnce({
        windowDays: 30,
        series: []
      })
      .mockResolvedValueOnce({
        windowDays: 90,
        series: []
      });

    render(<MarketingAnalytics />);

    await waitFor(() => expect(screen.getByText('Last 30 days')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: '90d' }));

    await waitFor(() => expect(getMarketingFunnelSnapshot).toHaveBeenLastCalledWith({ days: 90 }));
    expect(getMarketingFunnelSeries).toHaveBeenLastCalledWith({ days: 90 });
    expect(screen.getByText('Last 90 days')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('shows a load failure message when the snapshot request fails', async () => {
    getMarketingFunnelSnapshot.mockRejectedValue({
      response: {
        data: {
          error: 'Auth required'
        }
      }
    });
    getMarketingFunnelSeries.mockResolvedValue({
      windowDays: 30,
      series: []
    });

    render(<MarketingAnalytics />);

    await waitFor(() => expect(screen.getByText('Auth required')).toBeInTheDocument());
  });
});
