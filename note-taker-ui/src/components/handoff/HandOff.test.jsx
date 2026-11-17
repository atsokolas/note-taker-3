import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HandOff from './HandOff';
import WhileAway from '../../pages/WhileAway';
import { getHandoff, handOff, listHandoffs } from '../../api/handoffs';
import { inkPencil } from '../../api/pencil';

jest.mock('../../api/handoffs', () => ({ handOff: jest.fn(), listHandoffs: jest.fn(), getHandoff: jest.fn(), cancelHandoff: jest.fn() }));
jest.mock('../../api/pencil', () => ({ inkPencil: jest.fn() }));

const at = '2026-11-17T01:41:00Z';

test('⌘⇧Return opens one line; what is typed goes to Noeis with the page it came from', async () => {
  handOff.mockResolvedValue({ id: 'h1', status: 'waiting', to: 'noeis', createdAt: at });
  render(<MemoryRouter><HandOff context={{ kind: 'note', id: 'n1', title: 'Hiring' }} /></MemoryRouter>);
  fireEvent.keyDown(window, { key: 'Enter', metaKey: true, shiftKey: true });
  fireEvent.change(screen.getByRole('textbox', { name: 'What should be done while you are away' }), { target: { value: 'Finish the base rates section.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Hand off' }));
  expect(await screen.findByText(/Handed to Noeis at/)).toBeInTheDocument();
  expect(handOff).toHaveBeenCalledWith({ ask: 'Finish the base rates section.', to: 'noeis', context: { kind: 'note', id: 'n1', title: 'Hiring', excerpt: '' } });
  expect(screen.getByRole('link', { name: 'See' })).toHaveAttribute('href', '/away?handoff=h1');
});

test('coming back: what the agent did, what is open, what is next, and what it wrote, inked with i', async () => {
  const done = { id: 'h1', ask: 'Finish the base rates section.', status: 'done', takenBy: 'Noeis', finishedAt: at, context: { kind: 'note', id: 'n1', title: 'Hiring' }, did: 'Finished it.', open: 'Which study?', next: 'Find it.' };
  listHandoffs.mockResolvedValue([done]);
  getHandoff.mockResolvedValue({ ...done, wrote: [{ kind: 'note', id: 'n1', title: 'Hiring' }, { kind: 'highlight', id: 'a1', highlightId: 'h9', title: 'Panels', text: 'Panels overweight charisma.' }] });
  inkPencil.mockResolvedValue();
  render(<MemoryRouter><WhileAway /></MemoryRouter>);
  expect(await screen.findByRole('heading', { level: 2, name: 'Finish the base rates section.' })).toBeInTheDocument();
  expect(screen.getByText(/Noeis finished at/)).toBeInTheDocument();
  expect(screen.getByText('Which study?')).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'j' });
  fireEvent.keyDown(window, { key: 'i' });
  expect(inkPencil).toHaveBeenCalledWith(expect.objectContaining({ kind: 'highlight', id: 'a1', highlightId: 'h9' }));
  expect(await screen.findByText('Inked.')).toBeInTheDocument();
});
