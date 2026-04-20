import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { getMarketingFunnelSnapshot } from '../api/marketingAnalytics';

jest.mock('../api/marketingAnalytics', () => ({
  getMarketingFunnelSnapshot: jest.fn()
}));

jest.mock('./Export', () => () => <div>Export panel</div>);

jest.mock('../api/tourApi', () => ({
  resetTourState: jest.fn().mockResolvedValue({})
}));

describe('Settings marketing reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders marketing funnel metrics after loading', async () => {
    getMarketingFunnelSnapshot.mockResolvedValue({
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

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(screen.getByText('Loading funnel snapshot…')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('Ai Second Brain')).toBeInTheDocument();
    expect(screen.getByText('google / organic')).toBeInTheDocument();
    expect(screen.getByText('2 activated')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open full analytics' })).toHaveAttribute('href', '/marketing-analytics');
    expect(screen.getByRole('link', { name: 'Open Search Console importer' })).toHaveAttribute('href', '/search-console-opportunities');
  });
});
