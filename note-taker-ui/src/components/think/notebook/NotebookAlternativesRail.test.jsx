import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NotebookAlternativesRail from './NotebookAlternativesRail';

const setup = (overrides = {}) => {
  const trial = { id: 'a', target: { blockId: 'p1', baseText: 'Original words' }, alternative: 'Other words', origin: 'human' };
  const props = { trial, trials: [trial], preview: 'trial', status: 'ready', onChoose: jest.fn(), onChange: jest.fn(), onPreview: jest.fn(), onAdd: jest.fn(), onKeep: jest.fn(), onScope: jest.fn(), onClose: jest.fn(), onDiscard: jest.fn(), onReview: jest.fn(), onAsk: jest.fn(), ...overrides };
  render(<NotebookAlternativesRail {...props} />);
  return props;
};

test('typing and ordinary button activation never accidentally adopt a preview', () => {
  const props = setup();
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close alternatives' }), { key: 'Enter' });
  expect(props.onKeep).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('region'), { key: 'Enter' });
  expect(props.onKeep).toHaveBeenCalledTimes(1);
});

test('comparison keys return to original; Escape preserves the trial', () => {
  const props = setup();
  fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowDown' });
  expect(props.onPreview).toHaveBeenCalledWith('original');
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(props.onDiscard).not.toHaveBeenCalled();
});

test('a changed passage can be reviewed but cannot be adopted', () => {
  const props = setup({ status: 'stale' });
  expect(screen.getByRole('button', { name: 'Keep wording' })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole('region'), { key: 'Enter' });
  expect(props.onKeep).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Review current passage' }));
  expect(props.onReview).toHaveBeenCalledTimes(1);
});
