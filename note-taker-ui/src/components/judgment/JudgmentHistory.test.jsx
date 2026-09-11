import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import JudgmentHistory from './JudgmentHistory';

describe('JudgmentHistory', () => {
  it('shows an abbreviated spine you can open', () => {
    render(
      <JudgmentHistory
        view={{
          standing: { since: 'Held since August 18.' },
          lessons: [{
            id: 'l1',
            at: '2026-08-20T12:00:00.000Z',
            text: 'Announced capacity is not delivered capacity, and the gap is the whole bet.'
          }]
        }}
        room={<p>The room</p>}
        dependencies={<p>The rests</p>}
      />
    );

    expect(screen.queryByText('Held')).not.toBeInTheDocument();
    const summary = document.querySelector('.judgment-history__event summary');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getByText(/the gap is the whole bet/)).toBeInTheDocument();
    expect(screen.getByText('Who sat with it')).toBeInTheDocument();
    expect(screen.getByText('Stands on its own')).toBeInTheDocument();
  });
});
