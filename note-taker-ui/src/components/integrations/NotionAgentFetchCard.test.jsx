import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NotionAgentFetchCard from './NotionAgentFetchCard';

const STORAGE_KEY = 'noeis.notion.lastAgentFetchAt.v1';

describe('NotionAgentFetchCard', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the disconnected hint when no Notion connection exists', () => {
    render(<NotionAgentFetchCard connected={false} onFetch={() => {}} />);
    expect(screen.getByText('Thought partner · Notion')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Let Thought partner fetch your pages' })).toBeInTheDocument();
    expect(screen.getByText(/Connect Notion above first/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch now' })).toBeDisabled();
  });

  it('enables the fetch button once connected', () => {
    const onFetch = jest.fn();
    render(<NotionAgentFetchCard connected onFetch={onFetch} />);
    const button = screen.getByRole('button', { name: 'Fetch now' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onFetch).toHaveBeenCalledTimes(1);
  });

  it('shows the fetching state during a request', () => {
    render(<NotionAgentFetchCard connected fetching onFetch={() => {}} />);
    const button = screen.getByRole('button', { name: 'Fetching…' });
    expect(button).toBeDisabled();
  });

  it('renders status pill + counts on success', () => {
    render(
      <NotionAgentFetchCard
        connected
        onFetch={() => {}}
        result={{
          status: 'success',
          fetched: 5,
          created: 3,
          updated: 1,
          skipped: 1,
          failed: 0,
          summary: 'Imported 3 pages, Updated 1, Skipped 1.',
          errors: []
        }}
      />
    );
    expect(screen.getByText('Up to date')).toBeInTheDocument();
    expect(screen.getByText('Imported 3 pages, Updated 1, Skipped 1.')).toBeInTheDocument();
    // Counts
    const counts = screen.getByTestId('notion-agent-fetch-card-result');
    expect(counts.textContent).toContain('3');
    expect(counts.textContent).toContain('created');
    expect(counts.textContent).toContain('skipped');
  });

  it('substitutes the "all up to date" message when nothing changed', () => {
    render(
      <NotionAgentFetchCard
        connected
        onFetch={() => {}}
        result={{ status: 'success', fetched: 4, created: 0, updated: 0, skipped: 4, failed: 0, summary: 'Skipped 4 (no change).', errors: [] }}
      />
    );
    expect(screen.getByText(/All 4 pages already up to date/)).toBeInTheDocument();
  });

  it('toggles errors visibility on partial_failure', () => {
    render(
      <NotionAgentFetchCard
        connected
        onFetch={() => {}}
        result={{
          status: 'partial_failure',
          fetched: 2,
          created: 1,
          updated: 0,
          skipped: 0,
          failed: 1,
          summary: 'Imported 1 page, 1 failed.',
          errors: [{ pageId: 'page-2', message: 'boom' }]
        }}
      />
    );
    expect(screen.getByText('Partial failure')).toBeInTheDocument();
    expect(screen.queryByText('boom')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Show 1 error/ }));
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByText('page-2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hide 1 error/ }));
    expect(screen.queryByText('boom')).toBeNull();
  });

  it('persists last-fetched timestamp on success-style results', () => {
    const before = window.localStorage.getItem(STORAGE_KEY);
    expect(before).toBeNull();

    const { rerender } = render(
      <NotionAgentFetchCard connected onFetch={() => {}} />
    );
    expect(screen.queryByTestId('notion-agent-fetch-card-last-fetched')).toBeNull();

    rerender(
      <NotionAgentFetchCard
        connected
        onFetch={() => {}}
        result={{ status: 'success', fetched: 1, created: 1, updated: 0, skipped: 0, failed: 0, summary: 'Imported 1.', errors: [] }}
      />
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(screen.getByTestId('notion-agent-fetch-card-last-fetched')).toBeInTheDocument();
  });

  it('does not persist last-fetched on no_connection / token_invalid / search_failed', () => {
    render(
      <NotionAgentFetchCard
        connected
        onFetch={() => {}}
        result={{ status: 'token_invalid', fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0, summary: 'Reconnect Notion.', errors: [] }}
      />
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByText('Reconnect Notion')).toBeInTheDocument();
  });
});
