import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NoteStage from './NoteStage';
import NextSentence from './NextSentence';
import NotebookCuttings from './NotebookCuttings';
import { getNotebookCuttings } from '../../../api/notebook';

jest.mock('../../../api/notebook', () => ({ getNotebookCuttings: jest.fn() }));

test('a piece moves by its three words, and closing asks what it became', () => {
  const onMove = jest.fn();
  const { rerender } = render(<NoteStage board={{ stage: 'idea' }} onMove={onMove} />);
  expect(screen.getByRole('button', { name: 'Idea' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Working' }));
  expect(onMove).toHaveBeenLastCalledWith('in_progress');

  fireEvent.click(screen.getByRole('button', { name: 'Closed' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'What did it become?' }), { target: { value: ' Sent to Sam ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close it' }));
  expect(onMove).toHaveBeenLastCalledWith('done', 'Sent to Sam');

  rerender(<NoteStage board={{ stage: 'done', became: 'Sent to Sam' }} onMove={onMove} />);
  expect(screen.getByText('Became: Sent to Sam')).toBeInTheDocument();
});

test('the next sentence saves on Enter, and only when it changed', () => {
  const onSave = jest.fn();
  render(<NextSentence line="Old line" onSave={onSave} />);
  const field = screen.getByRole('textbox', { name: /Where does the next sentence go/ });
  fireEvent.blur(field);
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: 'Begin with the exception.' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  fireEvent.blur(field);
  expect(onSave).toHaveBeenCalledWith('Begin with the exception.');
});

test('cuttings say where each passage came from and open its piece', async () => {
  getNotebookCuttings.mockResolvedValue([
    { id: 'dimmed:n1:d1', kind: 'dimmed', noteId: 'n1', noteTitle: 'On moats', text: 'Maybe cut this.', createdAt: null },
    { id: 'aside:n2:l1', kind: 'aside', noteId: 'n2', noteTitle: 'Hiring', text: 'A digression.', createdAt: null }
  ]);
  const onOpen = jest.fn();
  render(<NotebookCuttings onOpen={onOpen} />);
  expect(await screen.findByText('Maybe cut this.')).toBeInTheDocument();
  expect(screen.getByText(/In the scratchpad of/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'On moats' }));
  expect(onOpen).toHaveBeenCalledWith('n1');
});
