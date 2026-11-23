import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WhatItAdded from './WhatItAdded';
import { fetchAdded, strikeAdded } from '../../api/retrieval';
import { createConnection } from '../../api/connections';

jest.mock('../../api/retrieval', () => ({ fetchAdded: jest.fn(), strikeAdded: jest.fn() }));
jest.mock('../../api/connections', () => ({ createConnection: jest.fn() }));

const echo = {
  kind: 'echo',
  key: 'highlight:h9',
  to: { type: 'highlight', id: 'h9', articleId: 'a2', title: 'The Checklist Manifesto', quote: 'A checklist is a net for the expert who forgets the obvious step.', at: '2025-03-04T12:00:00Z' },
  inked: null
};
const question = { kind: 'answers', key: 'question:q1', to: { type: 'question', id: 'q1', title: 'When does scale stop helping?' }, inked: 'c1' };
const page = { kind: 'belongs', key: 'wiki_page:p1', to: { type: 'wiki_page', id: 'p1', title: 'Checklists', quote: 'Checklists catch what memory drops.' }, inked: null };

const shown = () => render(<MemoryRouter><WhatItAdded articleId="a1" /></MemoryRouter>);

beforeEach(() => {
  fetchAdded.mockResolvedValue([echo, question, page]);
  createConnection.mockResolvedValue({});
  strikeAdded.mockResolvedValue({ struck: true });
});

it('says what a source added, in pencil until inked, each opening where it lives', async () => {
  shown();
  const echoLine = (await screen.findByText(/which you marked in/)).closest('li');
  expect(fetchAdded).toHaveBeenCalledWith('a1');
  expect(echoLine).toHaveClass('is-pencil');
  expect(echoLine).toHaveTextContent('Echoes “A checklist is a net for the expert who forgets the obvious step.”, which you marked in The Checklist Manifesto, March 2025.');
  expect(screen.getByRole('link', { name: 'The Checklist Manifesto' })).toHaveAttribute('href', expect.stringContaining('a2'));
  const questionLine = screen.getByText(/your question/).closest('li');
  expect(questionLine).toHaveClass('is-inked');
  expect(questionLine.querySelector('button')).toBeNull();
  expect(screen.getByRole('link', { name: 'Checklists' })).toHaveAttribute('href', '/wiki/workspace?page=p1');
});

it('inks a connection as yours, and strikes one so it goes', async () => {
  shown();
  const echoLine = (await screen.findByText(/which you marked in/)).closest('li');
  fireEvent.keyDown(echoLine, { key: 'i' });
  await waitFor(() => expect(echoLine).toHaveClass('is-inked'));
  expect(createConnection).toHaveBeenCalledWith({ fromType: 'article', fromId: 'a1', toType: 'highlight', toId: 'h9', relationType: 'related' });

  fireEvent.click(screen.getByText(/Checklists catch/).closest('li').querySelector('button:last-child'));
  await waitFor(() => expect(screen.queryByText(/Checklists catch/)).toBeNull());
  expect(strikeAdded).toHaveBeenCalledWith({ articleId: 'a1', key: 'wiki_page:p1', title: 'Checklists', quote: 'Checklists catch what memory drops.' });
});

it('shows nothing when nothing connected', async () => {
  fetchAdded.mockResolvedValue([]);
  const { container } = shown();
  await waitFor(() => expect(fetchAdded).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});
