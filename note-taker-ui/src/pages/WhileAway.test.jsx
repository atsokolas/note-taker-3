import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { listHandoffs } from '../api/handoffs';
import { getTaste, listPencil, strikePencil } from '../api/pencil';
import { listDisagreements } from '../api/disagreements';
import WhileAway from './WhileAway';

jest.mock('../api/handoffs', () => ({ listHandoffs: jest.fn() }));
jest.mock('../api/pencil', () => ({
  getTaste: jest.fn(),
  listPencil: jest.fn(),
  strikePencil: jest.fn()
}));
jest.mock('../api/disagreements', () => ({ listDisagreements: jest.fn() }));

it('keeps pencil changes visible during failed handoffs and lets the reader retry', async () => {
  listHandoffs.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([
    { id: 'handoff-1', ask: 'Read around the question', status: 'waiting', to: 'codex' }
  ]);
  listPencil.mockResolvedValue([
    { kind: 'note', id: 'n1', agent: 'Codex', title: 'A counterexample' }
  ]);
  getTaste.mockResolvedValue(null);
  listDisagreements.mockResolvedValue([]);
  strikePencil.mockRejectedValue(new Error('offline'));
  render(<MemoryRouter><WhileAway /></MemoryRouter>);

  expect(await screen.findByRole('link', { name: 'A counterexample' })).toBeInTheDocument();
  expect(screen.queryByText(/Nothing handed off yet/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry handoffs' }));
  expect(await screen.findByRole('heading', { name: 'Read around the question' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry handoffs' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Strike…' }));
  const reason = screen.getByRole('textbox', { name: 'Why strike it' });
  fireEvent.change(reason, { target: { value: 'It needs a quoted source' } });
  fireEvent.click(screen.getByRole('button', { name: 'Strike', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your reason is still here');
  expect(reason).toHaveValue('It needs a quoted source');
  expect(reason).toHaveFocus();
});
