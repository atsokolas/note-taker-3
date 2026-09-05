import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LibraryClaimModal from './LibraryClaimModal';

const highlight = { _id: 'h1', text: 'Capex rose 40% year over year.', articleTitle: 'Alphabet Q3' };
const open = (props = {}) => render(
  <LibraryClaimModal open highlight={highlight} onClose={() => {}} onCreate={async () => {}} {...props} />
);

describe('holding a belief from a sentence you marked', () => {
  it('stays shut until it is opened', () => {
    const { container } = render(<LibraryClaimModal open={false} highlight={highlight} />);
    expect(container).toBeEmptyDOMElement();
  });

  /* The highlight is what someone else wrote. A belief in their words is a
     quotation, so the field starts empty with the sentence shown beside it. */
  it('shows what you marked without borrowing it', () => {
    open();
    expect(screen.getByText(/Capex rose 40%/)).toBeInTheDocument();
    expect(screen.getByTestId('claim-modal-text')).toHaveValue('');
  });

  it('will not hold nothing', () => {
    open();
    expect(screen.getByTestId('claim-modal-hold')).toBeDisabled();
    fireEvent.change(screen.getByTestId('claim-modal-text'), { target: { value: '   ' } });
    expect(screen.getByTestId('claim-modal-hold')).toBeDisabled();
  });

  it('hands back the belief and what would change it', async () => {
    const onCreate = jest.fn().mockResolvedValue({});
    open({ onCreate });
    fireEvent.change(screen.getByTestId('claim-modal-text'), { target: { value: '  Capex is defensive.  ' } });
    fireEvent.change(screen.getByTestId('claim-modal-criteria'), { target: { value: '  Two quarters down  ' } });
    fireEvent.click(screen.getByTestId('claim-modal-hold'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({
      claim: 'Capex is defensive.',
      resolutionCriteria: 'Two quarters down',
      highlight
    }));
  });

  /* A belief you cannot falsify yet is still a belief. */
  it('holds one with nothing that would change it', async () => {
    const onCreate = jest.fn().mockResolvedValue({});
    open({ onCreate });
    fireEvent.change(screen.getByTestId('claim-modal-text'), { target: { value: 'Capex is defensive.' } });
    fireEvent.click(screen.getByTestId('claim-modal-hold'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ resolutionCriteria: '' })
    ));
  });

  /* Said where the reader typed, not behind them. */
  it('reports a failure without closing', async () => {
    const onCreate = jest.fn().mockRejectedValue({ response: { data: { error: 'That claim did not save.' } } });
    open({ onCreate });
    fireEvent.change(screen.getByTestId('claim-modal-text'), { target: { value: 'Capex is defensive.' } });
    fireEvent.click(screen.getByTestId('claim-modal-hold'));
    await waitFor(() => expect(screen.getByText('That claim did not save.')).toBeInTheDocument());
    expect(screen.getByTestId('claim-modal-hold')).toBeEnabled();
  });

  /* The reason the field is worth filling, said once. */
  it('says what naming a signal buys', () => {
    open();
    expect(screen.getByText(/your watchers look for it/)).toBeInTheDocument();
  });
});
