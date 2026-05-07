import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WikiBriefing from './WikiBriefing';
import { getWikiBriefing } from '../../api/wiki';

jest.mock('../../api/wiki', () => ({
  getWikiBriefing: jest.fn()
}));

const renderBriefing = () => render(
  <MemoryRouter>
    <WikiBriefing />
  </MemoryRouter>
);

describe('WikiBriefing', () => {
  beforeEach(() => {
    getWikiBriefing.mockReset();
  });

  it('renders the loading skeleton while the request is in flight', async () => {
    getWikiBriefing.mockReturnValue(new Promise(() => {})); // never resolves
    renderBriefing();
    expect(screen.getByText('Daily briefing')).toBeInTheDocument();
    expect(screen.getByLabelText('Daily wiki briefing')).toHaveClass('wiki-briefing--loading');
  });

  it('renders the agent summary, signal chips, and rails when populated', async () => {
    getWikiBriefing.mockResolvedValueOnce({
      generatedAt: new Date(Date.now() - 60_000).toISOString(),
      summary: 'Two pages moved today: Compounding and Disruption.',
      counts: { newSources: 4, recentlyUpdatedPages: 2, driftingPages: 1 },
      recentlyUpdatedPages: [
        { _id: 'p1', title: 'Compounding interest', lastDraftedAt: new Date(Date.now() - 5 * 60_000).toISOString() },
        { _id: 'p2', title: 'Disruption', lastDraftedAt: new Date(Date.now() - 8 * 60_000).toISOString() }
      ],
      driftingPages: [
        { _id: 'p3', title: 'Network effects', driftSignals: 3 }
      ]
    });
    renderBriefing();
    await waitFor(() => expect(screen.getByTestId('wiki-briefing')).toBeInTheDocument());
    expect(screen.getByText('Two pages moved today: Compounding and Disruption.')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/new sources/)).toBeInTheDocument();
    expect(screen.getByText('Pages drifting')).toBeInTheDocument();
    expect(screen.getByText('Recently updated')).toBeInTheDocument();
    expect(screen.getByText('Network effects').closest('a')).toHaveAttribute('href', '/wiki/p3');
    expect(screen.getByText('Compounding interest').closest('a')).toHaveAttribute('href', '/wiki/p1');
  });

  it('hides itself entirely when the request fails', async () => {
    getWikiBriefing.mockRejectedValueOnce(new Error('boom'));
    const { container } = renderBriefing();
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('still renders the summary when no rails are populated', async () => {
    getWikiBriefing.mockResolvedValueOnce({
      generatedAt: new Date().toISOString(),
      summary: 'Your wiki is quiet today.',
      counts: { newSources: 0, recentlyUpdatedPages: 0, driftingPages: 0 },
      recentlyUpdatedPages: [],
      driftingPages: []
    });
    renderBriefing();
    await waitFor(() => expect(screen.getByTestId('wiki-briefing')).toBeInTheDocument());
    expect(screen.getByText('Your wiki is quiet today.')).toBeInTheDocument();
    expect(screen.queryByText('Pages drifting')).toBeNull();
    expect(screen.queryByText('Recently updated')).toBeNull();
  });

  it('singularizes "1 page drifting" / "1 new source" correctly', async () => {
    getWikiBriefing.mockResolvedValueOnce({
      generatedAt: new Date().toISOString(),
      summary: 'X.',
      counts: { newSources: 1, recentlyUpdatedPages: 1, driftingPages: 1 },
      recentlyUpdatedPages: [],
      driftingPages: []
    });
    renderBriefing();
    await waitFor(() => expect(screen.getByTestId('wiki-briefing')).toBeInTheDocument());
    expect(screen.getByText('new source')).toBeInTheDocument();
    expect(screen.getByText('page updated')).toBeInTheDocument();
    expect(screen.getByText('page drifting')).toBeInTheDocument();
  });
});
