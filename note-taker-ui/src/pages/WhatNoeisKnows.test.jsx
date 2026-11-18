import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WhatNoeisKnows from './WhatNoeisKnows';
import { addKnows, listKnows, recallFor } from '../api/knows';

jest.mock('../api/knows', () => ({ listKnows: jest.fn(), addKnows: jest.fn(), dropKnows: jest.fn(), recallFor: jest.fn() }));

test('says how many of the reader\'s questions recall still answers, and keeps a new one with what answers it', async () => {
  listKnows.mockResolvedValue({ found: 1, of: 2, checks: [
    { id: 'c1', question: 'What have I written about hiring?', found: true, rank: 2 },
    { id: 'c2', question: 'What did I save about sourdough?', found: false }
  ] });
  recallFor.mockResolvedValue([{ id: 'a1', title: 'Base rates', passage: 'Start from the base rate.' }]);
  addKnows.mockResolvedValue({});
  render(<WhatNoeisKnows />);
  expect(await screen.findByText('Noeis finds what answers 1 of your 2 questions, among the first eight it brings back.')).toBeInTheDocument();
  expect(screen.getByText(/Found second/)).toBeInTheDocument();
  expect(screen.getByText(/Missed/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'A question your library should answer' }), { target: { value: 'Where did I read about base rates?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  fireEvent.click(await screen.findByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Keep this question' }));
  expect(addKnows).toHaveBeenCalledWith({ question: 'Where did I read about base rates?', expects: ['a1'] });
});
