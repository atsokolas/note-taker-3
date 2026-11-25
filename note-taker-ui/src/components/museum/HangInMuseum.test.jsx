import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import HangInMuseum from './HangInMuseum';
import { hangPiece, onOwnMuseum, readOwnMuseum, readSource } from '../../api/museum';

jest.mock('../../api/museum', () => ({
  readOwnMuseum: jest.fn(),
  onOwnMuseum: jest.fn(),
  readSource: jest.fn(),
  hangPiece: jest.fn(),
  editPiece: jest.fn(),
  takeDown: jest.fn()
}));

const source = {
  title: 'You and Your Research',
  author: 'Richard Hamming',
  medium: '',
  year: '1986',
  url: 'https://example.com/hamming',
  own: false,
  passages: [
    { text: 'Work on the important problems.', note: 'It made me ask what matters.' },
    { text: 'Luck favors the prepared mind.', note: '' }
  ]
};

const wall = pieces => ({ museum: { name: 'Athan', handle: '', intro: '', open: false, retired: [], pieces }, kept: [] });

describe('Hang in museum', () => {
  beforeEach(() => {
    onOwnMuseum.mockReturnValue(() => {});
    readSource.mockResolvedValue({ source, piece: null });
  });

  it('hangs a highlight with the note you wrote beside it as its reason', async () => {
    readOwnMuseum.mockResolvedValue(wall([]));
    hangPiece.mockResolvedValue({ accession: '1986.1' });
    render(<MemoryRouter><HangInMuseum kind="article" id="a1" /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Hang in museum' }));
    const why = await screen.findByLabelText(/Why it is here/);
    expect(why).toHaveValue('It made me ask what matters.');
    expect(screen.getByText('Started from the note you wrote beside this passage.')).toBeInTheDocument();
    expect(screen.getByText(/Your other 1 highlight and notes here stay private/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Luck favors the prepared mind.' }));
    expect(why).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Hang it' })).toBeDisabled();
    fireEvent.change(why, { target: { value: 'Because it is true.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hang it' }));
    await waitFor(() => expect(hangPiece).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'article', id: 'a1', passage: 'Luck favors the prepared mind.', why: 'Because it is true.', author: 'Richard Hamming', year: '1986'
    })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('says a piece is already on your wall', async () => {
    readOwnMuseum.mockResolvedValue(wall([{ kind: 'article', id: 'a1', accession: '1986.1', title: 'You and Your Research' }]));
    render(<MemoryRouter><HangInMuseum kind="article" id="a1" /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'On your wall' })).toBeInTheDocument();
    expect(onOwnMuseum).toHaveBeenCalled();
  });
});
