import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MuseumEditor from './MuseumEditor';
import useOwnMuseum from '../components/museum/useOwnMuseum';

jest.mock('../components/museum/useOwnMuseum', () => jest.fn());
jest.mock('../components/museum/HangInMuseum', () => () => null);
jest.mock('../api/museum', () => ({ rehang: jest.fn(), saveMuseum: jest.fn() }));

const hamming = { accession: '2026.1', own: false, passage: 'Work on the important problems.', why: '', title: 'You and Your Research', author: 'Richard Hamming', medium: 'Talk', year: '1986', room: '', ledTo: [], url: '', reviewedAt: null };
const wall = (pieces) => ({ museum: { name: '', handle: '', intro: '', open: false, retired: [], pieces }, kept: [] });
const paint = (own) => {
  useOwnMuseum.mockReturnValue(own);
  render(<MemoryRouter><MuseumEditor /></MemoryRouter>);
};

test('an empty wall offers no door to visitors yet, only its settings to save', () => {
  paint(wall([]));
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open the wall' })).not.toBeInTheDocument();
});

test('a wall with a piece on it can be opened to visitors', () => {
  paint(wall([hamming]));
  expect(screen.getByRole('button', { name: 'Open the wall' })).toBeInTheDocument();
});
