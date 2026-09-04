import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import QuestionComposer from './QuestionComposer';

const open = (props = {}) => render(<QuestionComposer open onSubmit={() => {}} onCancel={() => {}} {...props} />);

describe('asking for a question before making one', () => {
  it('stays out of the way until it is opened', () => {
    render(<QuestionComposer open={false} />);
    expect(screen.queryByTestId('think-question-composer-popover')).not.toBeInTheDocument();
  });

  /* The opinion: a question is an open loop, and what makes it a loop rather
     than a mood is that something could close it. Both halves get asked. */
  it('asks what is open, and what would close it', () => {
    open();
    expect(screen.getByText('What is still open?')).toBeInTheDocument();
    expect(screen.getByText('What would settle this?')).toBeInTheDocument();
  });

  it('asks inside the concept you are standing in', () => {
    open({ conceptName: 'Compound Interest' });
    expect(screen.getByText('What is still open inside Compound Interest?')).toBeInTheDocument();
  });

  it('will not make a question out of nothing', () => {
    const onSubmit = jest.fn();
    open({ onSubmit });
    expect(screen.getByTestId('think-question-composer-submit')).toBeDisabled();
    fireEvent.change(screen.getByTestId('think-question-composer-input'), { target: { value: '   ' } });
    expect(screen.getByTestId('think-question-composer-submit')).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('hands back both halves, trimmed', () => {
    const onSubmit = jest.fn();
    open({ onSubmit });
    fireEvent.change(screen.getByTestId('think-question-composer-input'), { target: { value: '  Does the cycle outlast the hardware?  ' } });
    fireEvent.change(screen.getByTestId('think-question-composer-settles'), { target: { value: '  Two quarters of guidance  ' } });
    fireEvent.click(screen.getByTestId('think-question-composer-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      text: 'Does the cycle outlast the hardware?',
      settledBy: 'Two quarters of guidance'
    });
  });

  /* Catching the question is the urgent half. A reader who does not yet know
     what would settle it should not be stopped at the door. */
  it('takes a question with nothing that would settle it yet', () => {
    const onSubmit = jest.fn();
    open({ onSubmit });
    fireEvent.change(screen.getByTestId('think-question-composer-input'), { target: { value: 'What am I missing?' } });
    fireEvent.click(screen.getByTestId('think-question-composer-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ text: 'What am I missing?', settledBy: '' });
  });

  /* Questions run long and wrap. Enter has to break the line. */
  it('breaks the line on Enter and commits on the chord', () => {
    const onSubmit = jest.fn();
    open({ onSubmit });
    const field = screen.getByTestId('think-question-composer-input');
    fireEvent.change(field, { target: { value: 'A long one' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledWith({ text: 'A long one', settledBy: '' });
  });

  it('closes on Escape from either field', () => {
    const onCancel = jest.fn();
    open({ onCancel });
    fireEvent.keyDown(screen.getByTestId('think-question-composer-input'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByTestId('think-question-composer-settles'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('says what went wrong instead of swallowing it', () => {
    open({ error: 'Failed to create question.' });
    expect(screen.getByTestId('think-question-composer-status')).toHaveTextContent('Failed to create question.');
  });
});
