import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import LibraryReadingRoomLead from './LibraryReadingRoomLead';

const sampleArticles = [
  {
    _id: 'a2',
    title: "Poor Charlie's Almanack",
    createdAt: '2026-05-01T00:00:00Z',
    highlightCount: 27,
    concepts: [{ name: 'Opportunity Cost' }, { name: 'Circle of Competence' }]
  },
  {
    _id: 'u1',
    title: 'Unfiled import',
    highlightCount: 3
  }
];

describe('LibraryReadingRoomLead', () => {
  it('renders the reopen lead and maintenance strip', () => {
    render(
      <LibraryReadingRoomLead
        articles={sampleArticles}
        allArticles={sampleArticles}
        unfiledCount={2}
        onSelectArticle={jest.fn()}
        onReviewFiling={jest.fn()}
        onToggleSuppressed={jest.fn()}
      />
    );

    expect(screen.getByText("Reopen Poor Charlie's Almanack")).toBeInTheDocument();
    expect(screen.getByText(/27 highlights are now pulling toward Opportunity Cost and Circle of Competence/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Corpus maintenance')).toHaveClass('library-reading-room-lead__maintenance-strip');
    expect(screen.getByText(/2 unfiled/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review filing suggestions' })).toBeInTheDocument();
  });

  it('opens the selected article from the reopen headline', () => {
    const onSelectArticle = jest.fn();
    render(
      <LibraryReadingRoomLead
        articles={sampleArticles}
        allArticles={sampleArticles}
        unfiledCount={2}
        onSelectArticle={onSelectArticle}
        onReviewFiling={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText("Reopen Poor Charlie's Almanack"));
    expect(onSelectArticle).toHaveBeenCalledWith('a2');
  });

  it('exposes a stable Open in Reading Room action', () => {
    const onSelectArticle = jest.fn();
    render(
      <LibraryReadingRoomLead
        articles={sampleArticles}
        allArticles={sampleArticles}
        onSelectArticle={onSelectArticle}
        onReviewFiling={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open in Reading Room' }));
    expect(onSelectArticle).toHaveBeenCalledWith('a2');
  });

  it('routes filing review through the maintenance action', () => {
    const onReviewFiling = jest.fn();
    render(
      <LibraryReadingRoomLead
        articles={sampleArticles}
        allArticles={sampleArticles}
        unfiledCount={2}
        onSelectArticle={jest.fn()}
        onReviewFiling={onReviewFiling}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Review filing suggestions' }));
    expect(onReviewFiling).toHaveBeenCalledTimes(1);
  });

  it('shows filing progress and completion receipt states', () => {
    const { rerender } = render(
      <LibraryReadingRoomLead
        articles={sampleArticles}
        allArticles={sampleArticles}
        unfiledCount={2}
        onSelectArticle={jest.fn()}
        onReviewFiling={jest.fn()}
        filingLaunching
      />
    );

    expect(screen.getByRole('button', { name: 'Classifying…' })).toBeDisabled();

    rerender(
      <LibraryReadingRoomLead
        articles={sampleArticles}
        allArticles={sampleArticles}
        unfiledCount={2}
        onSelectArticle={jest.fn()}
        onReviewFiling={jest.fn()}
        filingReceipt={{
          stage: 'ready',
          summary: 'Staged 2 filing suggestions across 2 folders for review.'
        }}
      />
    );

    expect(screen.getByTestId('library-filing-receipt')).toHaveTextContent(
      'Staged 2 filing suggestions across 2 folders for review.'
    );
  });

  it('shows a cruft suppression notice in the maintenance strip', () => {
    render(
      <LibraryReadingRoomLead
        articles={sampleArticles}
        allArticles={[
          ...sampleArticles,
          { _id: 'c1', title: 'Blah', highlightCount: 1 },
          { _id: 'c2', title: 'Test', highlightCount: 1 }
        ]}
        unfiledCount={2}
        onSelectArticle={jest.fn()}
        onReviewFiling={jest.fn()}
        onToggleSuppressed={jest.fn()}
      />
    );

    expect(screen.getByTestId('library-cruft-notice')).toHaveTextContent(
      '2 low-signal imports were kept out of your return view.'
    );
    expect(screen.getByRole('button', { name: 'Show review imports' })).toBeInTheDocument();
  });

  it('lets the user hide low-signal items after opening explicit review mode', () => {
    const onToggleSuppressed = jest.fn();
    render(
      <LibraryReadingRoomLead
        articles={[{ _id: 'a1', title: 'Visible source' }]}
        allArticles={[{ _id: 'a1', title: 'Visible source' }]}
        suppressedVisible
        onToggleSuppressed={onToggleSuppressed}
      />
    );

    expect(screen.getByTestId('library-cruft-notice')).toHaveTextContent('Showing hidden review imports.');
    fireEvent.click(screen.getByRole('button', { name: 'Hide review imports' }));
    expect(onToggleSuppressed).toHaveBeenCalledTimes(1);
  });
});
