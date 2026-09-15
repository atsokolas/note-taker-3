import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import QuestionShareView from './QuestionShareView';
import { questionContribution, questionMandate, questionSnapshot, questionSuccession } from './thinkShareFixture';

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

  it('closes with a brief beside the readings, not as consensus', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({
          contributions: [questionContribution({
            interpretation: 'The horizon is the claim, not the fact.',
            interpretedBy: 'Athan'
          })],
          brief: {
            agreement: 'The fact is shared. The horizon is not.',
            remainder: 'The window may close before compounding pays.',
            observation: 'Watch who is still in the room when the cost arrives.',
            by: 'Athan'
          }
        })}
      />
    );
    expect(screen.getByTestId('question-share-brief')).toHaveTextContent('What holds');
    expect(screen.getByTestId('question-share-brief')).toHaveTextContent('The fact is shared. The horizon is not.');
    expect(screen.getByTestId('question-share-brief')).toHaveTextContent('Athan still holds');
    expect(screen.getByTestId('question-share-brief')).toHaveTextContent('The window may close before compounding pays.');
    expect(screen.getByTestId('question-share-brief')).toHaveTextContent('What could move this');
    expect(screen.getByText('Same fact, different time horizon.')).toBeInTheDocument();
    expect(screen.queryByLabelText('What holds')).not.toBeInTheDocument();
  });

  it('opens a successor at the last unresolved question and keeps an empty outcome off the page', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({
          contributions: [questionContribution()],
          brief: {
            agreement: 'The fact is shared. The horizon is not.',
            remainder: 'The window may close before compounding pays.',
            observation: 'Watch who is still in the room when the cost arrives.',
            by: 'Athan'
          },
          succession: questionSuccession()
        })}
      />
    );
    expect(screen.getByRole('heading', { name: 'The window may close before compounding pays.' })).toBeInTheDocument();
    expect(screen.getByTestId('question-share-succession')).toHaveTextContent('Still open');
    expect(screen.getByTestId('question-share-succession')).toHaveTextContent('Athan handed this on');
    expect(screen.getByTestId('question-share-succession')).toHaveTextContent('Same fact, different time horizon.');
    expect(screen.getByTestId('question-share-succession')).toHaveTextContent('What survives compounding?');
    expect(screen.getByTestId('question-share-succession')).toHaveTextContent('Watch who is still in the room when the cost arrives.');
    expect(screen.getByTestId('question-share-succession')).toHaveTextContent('Alternatives then');
    expect(screen.queryByTestId('question-share-archive')).not.toBeInTheDocument();
    expect(screen.queryByText('What we nearly did')).not.toBeInTheDocument();
    expect(screen.queryByText('The other future is not in this record.')).not.toBeInTheDocument();
    expect(screen.queryByText('What happened later')).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-share-brief')).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-share-readings')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What survives compounding?' })).not.toBeInTheDocument();
  });

  it('records a later outcome and keeps a later reading beside the freeze', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({
          contributions: [
            questionContribution(),
            questionContribution({
              id: 'c2',
              by: 'Ada',
              text: 'A reading after the handoff.',
              remainder: ''
            })
          ],
          succession: questionSuccession({
            outcome: 'The window closed. The latecomer paid.'
          })
        })}
      />
    );
    expect(screen.getByTestId('question-share-succession')).toHaveTextContent('The window closed. The latecomer paid.');
    expect(screen.getByTestId('question-share-archive')).toHaveTextContent('What we nearly did');
    expect(screen.getByTestId('question-share-archive')).toHaveTextContent('Same fact, different time horizon.');
    expect(screen.getByTestId('question-share-archive')).toHaveTextContent('The window closed. The latecomer paid.');
    expect(screen.getByTestId('question-share-archive')).toHaveTextContent('The other future is not in this record.');
    expect(screen.getByTestId('question-share-succession')).not.toHaveTextContent('Alternatives then');
    expect(screen.getByTestId('question-share-succession')).not.toHaveTextContent('would have');
    expect(screen.getByTestId('question-share-readings')).toHaveTextContent('A reading after the handoff.');
    expect(screen.getByTestId('question-share-readings')).not.toHaveTextContent('Same fact, different time horizon.');
  });

  it('names an agent assignment and keeps an incomplete one off the page', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({
          contributions: [questionContribution()],
          mandate: questionMandate({ budget: { asks: 3, remaining: 2, spent: 1 } })
        })}
      />
    );
    expect(screen.getByTestId('question-share-mandate')).toHaveTextContent('Athan');
    expect(screen.getByTestId('question-share-mandate')).toHaveTextContent('This published question.');
    expect(screen.getByTestId('question-share-mandate')).toHaveTextContent('Ask about this published question');
    expect(screen.getByTestId('question-share-mandate')).toHaveTextContent('2 asks remain on this assignment.');
    expect(screen.queryByTestId('question-share-mandate')).not.toHaveTextContent('owner-1');
  });

  it('keeps an incomplete assignment off the page', () => {
    render(<QuestionShareView snapshot={questionSnapshot({ mandate: { owner: 'Athan' } })} />);
    expect(screen.queryByTestId('question-share-mandate')).not.toBeInTheDocument();
  });

  it('shows when the agent assignment paused', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({
          mandate: questionMandate({
            status: 'paused',
            pause: 'This assignment ended. The agent is paused.',
            budget: { asks: 3, remaining: 0, spent: 3 }
          })
        })}
      />
    );
    expect(screen.getByTestId('question-share-mandate')).toHaveTextContent('This assignment ended. The agent is paused.');
    expect(screen.queryByText('asks remain')).not.toBeInTheDocument();
  });

  it('lets a reader take the successor record as a readable file', () => {
    const createObjectURL = jest.fn(() => 'blob:records');
    const revokeObjectURL = jest.fn();
    const click = jest.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    render(
      <QuestionShareView
        snapshot={questionSnapshot({
          succession: questionSuccession(),
          mandate: questionMandate()
        })}
        slug="qslug"
      />
    );
    const createElement = document.createElement.bind(document);
    const spy = jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        return { href: '', download: '', click };
      }
      return createElement(tag);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Take these records' }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
    spy.mockRestore();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('hides the file in compact preview', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({ succession: questionSuccession() })}
        slug="qslug"
        compact
      />
    );
    expect(screen.queryByRole('button', { name: 'Take these records' })).not.toBeInTheDocument();
  });

  it('stays silent when nobody has offered a reading', () => {
    render(<QuestionShareView snapshot={questionSnapshot()} />);
    expect(screen.queryByTestId('question-share-readings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-share-yours')).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-share-brief')).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-share-presence')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take these records' })).not.toBeInTheDocument();
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

  it('shows a still-held reading to the person who offered it, not as a public reading', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({ yours: [questionContribution()] })}
        onOffer={() => {}}
      />
    );
    expect(screen.getByTestId('question-share-yours')).toHaveTextContent('With the author');
    expect(screen.getByTestId('question-share-yours')).toHaveTextContent('Same fact, different time horizon.');
    expect(screen.queryByTestId('question-share-readings')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offer a reading' })).toBeInTheDocument();
    expect(screen.queryByLabelText('How you take this')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take this back' })).not.toBeInTheDocument();
  });

  it('hides a held reading from compact preview even if yours is present', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({
          contributions: [questionContribution({ id: 'live', by: 'Ada', text: 'Already on the page.', remainder: '' })],
          yours: [questionContribution()]
        })}
        compact
      />
    );
    expect(screen.getByText('Already on the page.')).toBeInTheDocument();
    expect(screen.queryByTestId('question-share-yours')).not.toBeInTheDocument();
    expect(screen.queryByText('With the author')).not.toBeInTheDocument();
    expect(screen.queryByText('Same fact, different time horizon.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take this back' })).not.toBeInTheDocument();
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
    expect(await screen.findByText('It is with the author. It is not on the page yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('question-share-readings')).not.toBeInTheDocument();
  });

  it('lets the offerer take a held reading back', async () => {
    const onWithdraw = jest.fn().mockResolvedValue({ withdrawn: true });
    render(
      <QuestionShareView
        snapshot={questionSnapshot({ yours: [questionContribution()] })}
        onOffer={() => {}}
        onWithdraw={onWithdraw}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Take this back' }));
    await waitFor(() => expect(onWithdraw).toHaveBeenCalledWith('c1'));
  });

  it('lets the offerer take a placed reading back without inviting others to', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({
          contributions: [
            questionContribution({ mine: true }),
            questionContribution({ id: 'c2', by: 'Ada', text: 'Already on the page.', remainder: '', mine: false })
          ]
        })}
        onWithdraw={() => {}}
      />
    );
    const buttons = screen.getAllByRole('button', { name: 'Take this back' });
    expect(buttons).toHaveLength(1);
    expect(screen.getByText('Already on the page.')).toBeInTheDocument();
    expect(screen.queryByLabelText('How you take this')).not.toBeInTheDocument();
  });

  it('names who else is at the door and stays silent when nobody is', () => {
    const { rerender } = render(
      <QuestionShareView
        snapshot={questionSnapshot()}
        here={[{ by: 'Mara' }]}
      />
    );
    expect(screen.getByTestId('question-share-presence')).toHaveTextContent('Mara is here.');
    rerender(
      <QuestionShareView
        snapshot={questionSnapshot()}
        here={[{ by: 'Athan' }, { by: 'Mara' }]}
      />
    );
    expect(screen.getByTestId('question-share-presence')).toHaveTextContent('Athan and Mara are here.');
    rerender(
      <QuestionShareView
        snapshot={questionSnapshot()}
        here={[{ by: 'Ada' }, { by: 'Athan' }, { by: 'Mara' }]}
      />
    );
    expect(screen.getByTestId('question-share-presence')).toHaveTextContent('Ada, Athan, and Mara are here.');
    rerender(<QuestionShareView snapshot={questionSnapshot()} here={[]} />);
    expect(screen.queryByTestId('question-share-presence')).not.toBeInTheDocument();
  });

  it('hides presence from compact preview', () => {
    render(
      <QuestionShareView
        snapshot={questionSnapshot({ contributions: [questionContribution()] })}
        here={[{ by: 'Mara' }]}
        compact
      />
    );
    expect(screen.queryByTestId('question-share-presence')).not.toBeInTheDocument();
    expect(screen.getByText('Same fact, different time horizon.')).toBeInTheDocument();
  });
});
