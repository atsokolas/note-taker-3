import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SourceCorrectionReview from './SourceCorrectionReview';

const OLD = 'Two hours a week can sustain this.';
const NEW = 'Two hours a week cannot sustain this.';

const preview = {
  eventId: 'evt-1',
  oldQuotation: OLD,
  newEvidence: NEW,
  changedSegments: [
    { kind: 'equal', text: 'Two hours a week ' },
    { kind: 'removed', text: 'can' },
    { kind: 'added', text: 'cannot' },
    { kind: 'equal', text: ' sustain this.' }
  ],
  whatChanged: 'The saved passage was corrected.',
  whatItAffects: 'Who gets to experiment',
  whatINeed: 'Keep this work, change the quotation, or record no change.',
  sourceTitle: 'A letter on time',
  sourceHref: '/library?articleId=a1&highlightId=h1',
  sourceUpdatedOn: '2026-09-11',
  ui: 'review'
};

describe('SourceCorrectionReview', () => {
  it('shows the old quotation beside the new evidence and the changed phrase', () => {
    render(<SourceCorrectionReview preview={preview} onDispose={jest.fn()} />);
    expect(screen.getByText(OLD)).toBeInTheDocument();
    expect(screen.getByText(NEW)).toBeInTheDocument();
    const changed = screen.getByLabelText('Changed phrase');
    expect(changed.querySelector('del')).toHaveTextContent('can');
    expect(changed.querySelector('ins')).toHaveTextContent('cannot');
    expect(screen.getByText(/Source corrected 2026-09-11/)).toBeInTheDocument();
    expect(screen.getByText(/not a reading date/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep this work' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change the quotation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No change' })).toBeInTheDocument();
    expect(screen.getByText(/cannot tell/)).toBeInTheDocument();
  });

  it('stays silent without a qualifying preview', () => {
    const { container } = render(<SourceCorrectionReview preview={null} onDispose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['keep', 'Kept this work. The old quotation remains what was used.'],
    ['change', 'The quotation now follows the new evidence. The writing is unchanged.'],
    ['no_change', 'No change. The correction does not require this work to move.']
  ])('records %s without inventing a rewrite', async (action, receipt) => {
    const onDispose = jest.fn(async ({ eventId }) => ({
      sourceCorrection: {
        ...preview,
        eventId,
        ui: 'settled',
        disposition: action,
        reviewedOn: '2026-09-12'
      }
    }));
    const label = {
      keep: 'Keep this work',
      change: 'Change the quotation',
      no_change: 'No change'
    }[action];
    render(<SourceCorrectionReview preview={preview} onDispose={onDispose} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(onDispose).toHaveBeenCalledWith({ eventId: 'evt-1', action }));
    expect(await screen.findByText(receipt)).toBeInTheDocument();
    expect(screen.getByText(OLD)).toBeInTheDocument();
    expect(screen.getByText(NEW)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep this work' })).not.toBeInTheDocument();
  });
});
