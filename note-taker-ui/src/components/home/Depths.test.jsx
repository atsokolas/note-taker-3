import React from 'react';
import { render, screen } from '@testing-library/react';
import { ForNow, roomOf } from './Depths';

jest.mock('../../api/home', () => ({ readHome: jest.fn(), keepPassage: jest.fn(), readKept: jest.fn() }));

const work = (n, book = false) => ({ articleId: `w${n}`, title: `Work ${n}`, book, marks: 0, at: new Date(Date.now() - n * 3600000).toISOString() });

it('a room chooses its own works from the whole fortnight before the newest few are shown', () => {
  const home = { kept: [], asks: [], forNow: [...Array.from({ length: 9 }, (_, n) => work(n)), work(20, true)] };
  render(<ForNow works={roomOf(home, item => item.book).forNow} empty="No book open lately." />);
  expect(screen.getByRole('link', { name: 'Work 20' })).toBeInTheDocument();
});

it('shows the newest eight, and leaves the rest underneath', () => {
  render(<ForNow works={Array.from({ length: 10 }, (_, n) => work(n))} empty="" />);
  expect(screen.getAllByRole('link')).toHaveLength(8);
});
