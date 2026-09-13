import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SharedQuestionCompanion from './SharedQuestionCompanion.jsx';
import { questionBrief, questionContribution, questionSnapshot } from '../components/think/thinkShareFixture';

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
});
