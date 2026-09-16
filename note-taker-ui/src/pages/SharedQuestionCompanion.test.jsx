import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SharedQuestionCompanion from './SharedQuestionCompanion.jsx';
import { questionBrief, questionContribution, questionSnapshot, questionSuccession } from '../components/think/thinkShareFixture';

jest.mock('../components/agent/ThoughtPartnerPanel', () => ({
  __esModule: true,
  default: (props) => (
    <aside data-testid="thought-partner-panel">
      {props.subtitle}:{props.contextType}:{props.contextId}:{props.placeholder}
    </aside>
  )
}));

const page = questionSnapshot({
  contributions: [questionContribution()],
  brief: questionBrief(),
  yours: [questionContribution({ id: 'held', by: 'Ada', text: 'Still with the author.' })]
});

describe('SharedQuestionCompanion', () => {
  it('stays off the page until a signed-in person asks', () => {
    const { rerender } = render(
      <SharedQuestionCompanion slug="qslug" page={page} signedIn={false} />
    );
    expect(screen.queryByTestId('shared-question-companion')).not.toBeInTheDocument();

    rerender(<SharedQuestionCompanion slug="qslug" page={page} signedIn />);
    expect(screen.getByRole('button', { name: 'Ask about this reading' })).toBeInTheDocument();
    expect(screen.queryByTestId('thought-partner-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ask about this reading' }));
    expect(screen.getByTestId('thought-partner-panel')).toHaveTextContent(
      "Bound to this published question, Mara's reading, and the shared brief.:shared_question:qslug:Ask about this published question."
    );
    expect(screen.queryByText('Still with the author.')).not.toBeInTheDocument();
  });

  it('opens the existing companion on a successor record', () => {
    render(
      <SharedQuestionCompanion
        slug="qslug"
        page={questionSnapshot({
          contributions: [questionContribution()],
          brief: questionBrief(),
          yours: [questionContribution({ id: 'held', by: 'Ada', text: 'Still with the author.' })],
          succession: questionSuccession({
            outcome: 'The window closed. The latecomer paid.'
          })
        })}
        signedIn
        defaultOpen
      />
    );
    expect(screen.getByTestId('thought-partner-panel')).toHaveTextContent(
      'Bound to this successor record and what happened later.:shared_question:qslug:Ask about this handoff.'
    );
    expect(screen.queryByText('Still with the author.')).not.toBeInTheDocument();
    expect(screen.queryByText(/lesson|Library/i)).not.toBeInTheDocument();
  });

  it('pauses the ask when the assignment lapses', () => {
    render(
      <SharedQuestionCompanion
        slug="qslug"
        page={{
          ...page,
          mandate: {
            owner: 'Athan',
            scope: 'This published question.',
            tools: 'Ask about this published question (the public page only).',
            budget: { asks: 3, remaining: 0, spent: 3 },
            stop: 'Stop when the successor writes what happened later.',
            review: 'Return to this door to end or renew the assignment.',
            status: 'paused',
            pause: 'This assignment ended. The agent is paused.'
          }
        }}
        signedIn
      />
    );
    expect(screen.getByTestId('shared-question-companion')).toHaveTextContent(
      'This assignment ended. The agent is paused.'
    );
    expect(screen.queryByRole('button', { name: 'Ask about this reading' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('thought-partner-panel')).not.toBeInTheDocument();
  });
});
