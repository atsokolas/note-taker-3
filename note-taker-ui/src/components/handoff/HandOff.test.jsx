import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HandOff from './HandOff';
import WhileAway from '../../pages/WhileAway';
import { getHandoff, handOff, listHandoffs } from '../../api/handoffs';
import { getTaste, inkPencil, listPencil, strikePencil } from '../../api/pencil';
import { listDisagreements, settleDisagreement } from '../../api/disagreements';

jest.mock('../../api/handoffs', () => ({ handOff: jest.fn(), listHandoffs: jest.fn(), getHandoff: jest.fn(), cancelHandoff: jest.fn() }));
jest.mock('../../api/pencil', () => ({ inkPencil: jest.fn(), listPencil: jest.fn(), strikePencil: jest.fn(), getTaste: jest.fn() }));
jest.mock('../../api/citations', () => ({ usedIn: jest.fn() }));
jest.mock('../../api/disagreements', () => ({ listDisagreements: jest.fn(), settleDisagreement: jest.fn() }));

const at = '2026-11-17T01:41:00Z';

beforeEach(() => {
  listDisagreements.mockResolvedValue([]);
  settleDisagreement.mockResolvedValue({});
});

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

test('the shortcut opens a closed menu with the selected excerpt and Escape restores the action', async () => {
  handOff.mockClear();
  render(<MemoryRouter><details><summary>More</summary>
    <HandOff context={{ kind: 'note', id: 'n1', title: 'Hiring' }} readExcerpt={() => 'The qualifying sentence.'} />
  </details></MemoryRouter>);
  fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true, shiftKey: true });
  expect(screen.getByText('More').closest('details')).toHaveAttribute('open');
  const input = screen.getByRole('textbox', { name: 'What should be done while you are away' });
  expect(input).toHaveFocus();
  expect(screen.getByText('The qualifying sentence.')).toBeVisible();
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Hand off' })).toHaveFocus());
  expect(handOff).not.toHaveBeenCalled();
});

test('coming back: what the agent did, what is open, what is next, and what it wrote, inked with i', async () => {
  const done = { id: 'h1', ask: 'Finish the base rates section.', status: 'done', takenBy: 'Noeis', finishedAt: at, context: { kind: 'note', id: 'n1', title: 'Hiring' }, did: 'Finished it.', open: 'Which study?', next: 'Find it.' };
  listHandoffs.mockResolvedValue([done]);
  getHandoff.mockResolvedValue({ ...done, wrote: [{ kind: 'note', id: 'n1', title: 'Hiring' }, { kind: 'highlight', id: 'a1', highlightId: 'h9', title: 'Panels', text: 'Panels overweight charisma.' }] });
  inkPencil.mockResolvedValue();
  getTaste.mockResolvedValue({ inked: 0, struck: 0, lately: [] });
  listPencil.mockResolvedValue([
    { kind: 'note', id: 'n1', title: 'Hiring', agent: 'Noeis' },
    { kind: 'article', id: 'a7', title: 'Docs Claude read', agent: 'Claude Code' }
  ]);
  render(<MemoryRouter><WhileAway /></MemoryRouter>);
  expect(await screen.findByRole('heading', { level: 2, name: 'Finish the base rates section.' })).toBeInTheDocument();
  expect(screen.getByText(/Noeis finished at/)).toBeInTheDocument();
  expect(screen.getByText('Which study?')).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'j' });
  fireEvent.keyDown(window, { key: 'i' });
  expect(inkPencil).toHaveBeenCalledWith(expect.objectContaining({ kind: 'highlight', id: 'a1', highlightId: 'h9' }));
  expect(await screen.findByText('Inked.')).toBeInTheDocument();
  // What agents left outside any handoff follows, by agent, once.
  expect(screen.getByRole('heading', { level: 2, name: 'Also in pencil, by Claude Code' })).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Hiring' })).toHaveLength(2);
});

test('a note says where agents put it to work, once one has said so', async () => {
  const { default: UsedIn } = await import('../pencil/UsedIn');
  const { usedIn } = await import('../../api/citations');
  usedIn.mockResolvedValue([{ where: 'PR #12: hiring rubric', agent: 'Claude Code', at }]);
  render(<UsedIn id="n1" />);
  expect(await screen.findByText(/Put to work: PR #12: hiring rubric \(Claude Code,/)).toBeInTheDocument();
});

test('x strikes what an agent wrote, with why; what agents learn from that is on the page', async () => {
  listHandoffs.mockResolvedValue([]);
  listPencil.mockResolvedValue([{ kind: 'note', id: 'n2', title: 'Hiring, tidied', agent: 'Codex' }]);
  strikePencil.mockResolvedValue('restored');
  getTaste.mockResolvedValue({ inked: 9, struck: 3, lately: [{ verdict: 'strike', kind: 'note', agent: 'Codex', title: 'Panels', why: 'Too smooth.', at }] });
  render(<MemoryRouter><WhileAway /></MemoryRouter>);
  expect(await screen.findByText('Struck Codex’s Panels: Too smooth.')).toBeInTheDocument();
  expect(screen.getByText(/You have inked 9 and struck 3/)).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'x' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Why strike it' }), { target: { value: 'Keep my words.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Strike' }));
  expect(await screen.findByText('Struck; your version is back.')).toBeInTheDocument();
  expect(strikePencil).toHaveBeenCalledWith(expect.objectContaining({ kind: 'note', id: 'n2', why: 'Keep my words.' }));
});

test('where an agent runs against a view you hold, both sides are set out until you settle it', async () => {
  listHandoffs.mockResolvedValue([]);
  listPencil.mockResolvedValue([]);
  getTaste.mockResolvedValue({ inked: 0, struck: 0, lately: [] });
  listDisagreements.mockResolvedValue([{ id: 'd1', a: { agent: 'Codex', says: 'Interviews predict hiring well.' }, b: { agent: '', says: 'Interviews predict hiring poorly.' }, at }]);
  render(<MemoryRouter><WhileAway /></MemoryRouter>);
  expect(await screen.findByText(/Codex says: Interviews predict hiring well\. You hold: Interviews predict hiring poorly\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Settled' }));
  expect(settleDisagreement).toHaveBeenCalledWith('d1');
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Where they disagree' })).not.toBeInTheDocument());
});
