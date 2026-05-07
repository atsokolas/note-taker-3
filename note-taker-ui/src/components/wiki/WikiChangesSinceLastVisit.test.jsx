import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WikiChangesSinceLastVisit from './WikiChangesSinceLastVisit';

describe('WikiChangesSinceLastVisit', () => {
  it('renders nothing when the user has never visited before', () => {
    const { container } = render(
      <WikiChangesSinceLastVisit lastViewedAt="" added={['a']} removed={[]} onMarkReviewed={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there is no diff to show', () => {
    const { container } = render(
      <WikiChangesSinceLastVisit lastViewedAt="2026-04-25T00:00:00Z" added={[]} removed={[]} onMarkReviewed={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('summarizes counts and pluralizes correctly when claims are added or removed', () => {
    render(
      <WikiChangesSinceLastVisit
        lastViewedAt={new Date(Date.now() - 5 * 60_000).toISOString()}
        added={['new claim']}
        removed={['gone claim', 'gone too']}
        onMarkReviewed={() => {}}
      />
    );
    expect(screen.getByText(/1 new · 2 removed claims/)).toBeInTheDocument();
    expect(screen.getByText(/last here 5m ago/)).toBeInTheDocument();
  });

  it('toggles the diff body open and previews up to 3 added/removed claims', () => {
    render(
      <WikiChangesSinceLastVisit
        lastViewedAt={new Date().toISOString()}
        added={Array.from({ length: 5 }, (_, i) => `added ${i}`)}
        removed={Array.from({ length: 4 }, (_, i) => `gone ${i}`)}
        onMarkReviewed={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('wiki-changes-banner-toggle'));
    // First 3 of each are previewed
    expect(screen.getByText('added 0')).toBeInTheDocument();
    expect(screen.getByText('added 2')).toBeInTheDocument();
    expect(screen.queryByText('added 3')).toBeNull();
    expect(screen.getByText(/2 more new claims/)).toBeInTheDocument();
    expect(screen.getByText(/1 more removed claim\./)).toBeInTheDocument();
  });

  it('calls onMarkReviewed when the primary action is clicked', () => {
    const onMarkReviewed = jest.fn();
    render(
      <WikiChangesSinceLastVisit
        lastViewedAt={new Date().toISOString()}
        added={['new']}
        removed={[]}
        onMarkReviewed={onMarkReviewed}
      />
    );
    fireEvent.click(screen.getByTestId('wiki-changes-banner-mark-reviewed'));
    expect(onMarkReviewed).toHaveBeenCalledTimes(1);
  });

  it('renders only an "added" group when nothing was removed', () => {
    render(
      <WikiChangesSinceLastVisit
        lastViewedAt={new Date().toISOString()}
        added={['only added']}
        removed={[]}
        onMarkReviewed={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('wiki-changes-banner-toggle'));
    expect(screen.getByText('New claims')).toBeInTheDocument();
    expect(screen.queryByText('Removed claims')).toBeNull();
  });
});
