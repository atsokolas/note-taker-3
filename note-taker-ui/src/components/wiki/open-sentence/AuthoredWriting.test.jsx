import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthoredContinuation } from './AuthoredWriting';

const record = {
  revision: 4,
  draft: { title: 'Room to be wrong', writing: 'Keep the exception.' },
  saved: { pageId: 'page-1', claimId: 'claim-1' }
};
const copy = () => screen.getByRole('button', { name: 'Copy continuation link' });

describe('private continuation', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn().mockResolvedValue() } });
  });

  it('copies only the exact identity and acknowledges clipboard success', async () => {
    render(<AuthoredContinuation record={record} />);
    fireEvent.click(copy());
    await screen.findByText('Link copied. Open it in a new tab, signed into the same account.');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost/wiki/read/page-1?claimId=claim-1&exploration=1');
  });

  it.each(['dirty', 'saving', 'error', 'conflict'])('does not offer unacknowledged or conflicted %s work', field => {
    render(<AuthoredContinuation record={{ ...record, [field]: true }} />);
    expect(copy()).toBeDisabled();
    fireEvent.click(copy());
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('does not invent a continuation before the first saved work', () => {
    render(<AuthoredContinuation record={{ draft: record.draft, revision: 0 }} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([false, true])('offers a selectable exact link when clipboard is unavailable (absent: %s)', async absent => {
    if (absent) Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    else navigator.clipboard.writeText.mockRejectedValue(new Error('denied'));
    render(<AuthoredContinuation record={{ ...record, saved: { articleId: 'a1', highlightId: 'gone-h1' } }} />);
    fireEvent.click(copy());
    const input = await screen.findByLabelText('Continuation link');
    expect(input).toHaveValue('http://localhost/library?articleId=a1&highlightId=gone-h1&exploration=1');
    expect(screen.queryByText(/^Link copied/)).not.toBeInTheDocument();
    fireEvent.focus(input);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('does not show an old copy receipt after writing changes during clipboard permission', async () => {
    let resolve;
    navigator.clipboard.writeText.mockReturnValue(new Promise(done => { resolve = done; }));
    const { rerender } = render(<AuthoredContinuation record={record} />);
    fireEvent.click(copy());
    rerender(<AuthoredContinuation record={{ ...record, dirty: true }} />);
    await act(async () => resolve());
    expect(screen.queryByText(/^Link copied/)).not.toBeInTheDocument();
    rerender(<AuthoredContinuation record={{ ...record, revision: 5 }} />);
    await waitFor(() => expect(copy()).toBeEnabled());
    expect(screen.queryByText(/^Link copied/)).not.toBeInTheDocument();
  });
});
