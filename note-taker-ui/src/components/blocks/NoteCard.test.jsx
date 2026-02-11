import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NoteCard from './NoteCard';

describe('NoteCard progressive disclosure', () => {
  it('defaults to collapsed and hides full body text', () => {
    render(
      <NoteCard
        id="n-1"
        title="Test note"
        bodyText={'First line summary\nSecond line with TAIL_MARKER_NOTE_BODY'}
        type="note"
        tags={['alpha', 'beta', 'gamma']}
        timestamp="2026-01-01T00:00:00.000Z"
      />
    );
    expect(screen.getByText('Expand')).toBeInTheDocument();
    expect(screen.queryByText(/TAIL_MARKER_NOTE_BODY/i)).not.toBeInTheDocument();
  });

  it('toggles expanded state per card', () => {
    render(
      <NoteCard
        id="n-2"
        title="Test note"
        bodyText={'First line summary\nSecond line with TAIL_MARKER_NOTE_BODY'}
        type="note"
      />
    );

    fireEvent.click(screen.getByText('Expand'));
    expect(screen.getByText(/TAIL_MARKER_NOTE_BODY/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Collapse'));
    expect(screen.queryByText(/TAIL_MARKER_NOTE_BODY/i)).not.toBeInTheDocument();
  });
});
