import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import QuestionSettleLine from './QuestionSettleLine';

const question = { _id: 'q1', text: 'Does the cycle outlast the hardware?', settledBy: '' };

describe('what would settle a question', () => {
  it('says nothing at all when there is no question open', () => {
    const { container } = render(<QuestionSettleLine question={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  /* A blank line reads as "nothing to add". What it means is that nobody has
     said yet what would close the loop, and those are different. */
  it('prints the absence rather than leaving a gap', () => {
    render(<QuestionSettleLine question={question} />);
    expect(screen.getByTestId('question-settle-edit')).toHaveTextContent('Nothing named yet that would settle this.');
  });

  it('prints the condition once there is one', () => {
    render(<QuestionSettleLine question={{ ...question, settledBy: 'Two quarters of guidance' }} />);
    expect(screen.getByTestId('question-settle-edit')).toHaveTextContent('Two quarters of guidance');
  });

  /* A question caught in a hurry rarely has one yet, so a field that could
     only be filled at the door would be a field nobody fills. */
  it('can be named later, from the question itself', () => {
    const onSave = jest.fn();
    render(<QuestionSettleLine question={question} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('question-settle-edit'));
    fireEvent.change(screen.getByTestId('question-settle-input'), { target: { value: '  A filing that says otherwise  ' } });
    fireEvent.keyDown(screen.getByTestId('question-settle-input'), { key: 'Enter', metaKey: true });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ _id: 'q1', settledBy: 'A filing that says otherwise' }));
  });

  it('does not write when nothing changed', () => {
    const onSave = jest.fn();
    render(<QuestionSettleLine question={{ ...question, settledBy: 'Already said' }} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('question-settle-edit'));
    fireEvent.blur(screen.getByTestId('question-settle-input'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('gives the old answer back on Escape', () => {
    const onSave = jest.fn();
    render(<QuestionSettleLine question={{ ...question, settledBy: 'Already said' }} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('question-settle-edit'));
    fireEvent.change(screen.getByTestId('question-settle-input'), { target: { value: 'half a thought' } });
    fireEvent.keyDown(screen.getByTestId('question-settle-input'), { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('question-settle-edit')).toHaveTextContent('Already said');
  });
});
