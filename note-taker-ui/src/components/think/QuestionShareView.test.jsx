import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionShareView from './QuestionShareView';
import { questionContribution, questionSnapshot } from './thinkShareFixture';

describe('QuestionShareView', () => {
  it('keeps a later reading beside the frozen question', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({ contributions: [questionContribution()] })}
      />
    );
    expect(screen.getByRole('heading', { name: 'What survives compounding?' })).toBeInTheDocument();
    expect(screen.getByTestId('question-share-readings')).toHaveTextContent('Mara');
    expect(screen.getByText('Same fact, different time horizon.')).toBeInTheDocument();
    expect(screen.getByText('Still holds: Who pays when the window closes?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Offer a reading' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('How you take this')).not.toBeInTheDocument();
  });

  it('keeps the owner take beside the reading, not in its place', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({
          contributions: [questionContribution({
            interpretation: 'The horizon is the claim, not the fact.',
            interpretedBy: 'Athan'
          })]
        })}
      />
    );
    expect(screen.getByText('Same fact, different time horizon.')).toBeInTheDocument();
    expect(screen.getByText('Still holds: Who pays when the window closes?')).toBeInTheDocument();
    expect(screen.getByText('Athan — Not quite: The horizon is the claim, not the fact.')).toBeInTheDocument();
    expect(screen.queryByLabelText('How you take this')).not.toBeInTheDocument();
  });

  it('stays silent when nobody has offered a reading', () => {
    render(<QuestionShareView snapshot={questionSnapshot()} />);
    expect(screen.queryByTestId('question-share-readings')).not.toBeInTheDocument();
    expect(screen.queryByText(/Still holds/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not quite/)).not.toBeInTheDocument();
  });

  it('hides the invite in compact preview and still shows the reading', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({ contributions: [questionContribution()] })}
        compact
        onOffer={() => {}}
      />
    );
    expect(screen.getByText('Same fact, different time horizon.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Offer a reading' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Later private edits/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('How you take this')).not.toBeInTheDocument();
  });

  it('offers a named reading with an optional remainder', async () => {
    const onOffer = jest.fn().mockResolvedValue({ sent: true });
    render(<QuestionShareView snapshot={questionSnapshot()} onOffer={onOffer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Offer a reading' }));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Mara' } });
    fireEvent.change(screen.getByLabelText('What you bring'), {
      target: { value: 'Same fact, different time horizon.' }
    });
    fireEvent.change(screen.getByLabelText('What you still hold'), {
      target: { value: 'Who pays when the window closes?' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Offer this reading' }));
    await waitFor(() => expect(onOffer).toHaveBeenCalledWith({
      by: 'Mara',
      text: 'Same fact, different time horizon.',
      remainder: 'Who pays when the window closes?'
    }));
    expect(await screen.findByText('It is on this page, beside the question.')).toBeInTheDocument();
  });
});
