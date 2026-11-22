import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FromTheDesk from './FromTheDesk';

it('sets the changelog as dated, signed issues, newest first', () => {
  render(<MemoryRouter><FromTheDesk page="changelog" /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1, name: 'What changed in Noeis' })).toBeInTheDocument();
  const issues = screen.getAllByRole('article');
  expect(issues[0]).toHaveTextContent(/Sunday, November 22, 2026.*No unread counts\. Ever\./);
  expect(screen.getByRole('link', { name: 'manifesto' })).toHaveAttribute('href', '/manifesto');
  expect(screen.getByText('— Athan')).toBeInTheDocument();
});

it('says the one rule, and links back to what changed', () => {
  render(<MemoryRouter><FromTheDesk page="manifesto" /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1, name: 'No unread counts, anywhere, ever' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'What changed in Noeis' })).toHaveAttribute('href', '/changelog');
});
