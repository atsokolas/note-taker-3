import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import MuseumWall from './MuseumWall';

const museum = {
  name: 'Athan Tsokolas',
  handle: 'athan',
  intro: 'What changed how I think.',
  retired: ['2015.1'],
  pieces: [
    { accession: '2016.1', own: false, passage: 'Work on the important problems.', why: 'It made me ask what matters.', title: 'You and Your Research', author: 'Richard Hamming', medium: 'Talk', year: '1986', room: 'Craft', ledTo: ['2021.1'], url: 'https://example.com/hamming', reviewedAt: null },
    { accession: '2021.1', own: true, passage: '', why: 'Where I wrote it down.', title: 'On taste', author: '', medium: 'Wiki page in Noeis', year: '2021', room: 'Craft', ledTo: [], url: '', reviewedAt: null }
  ]
};

function Visit({ start = '' }) {
  const [open, setOpen] = useState(start);
  return <MuseumWall museum={museum} open={open} onOpen={setOpen} />;
}

describe('MuseumWall', () => {
  it('hangs every piece with its tag, the pieces you made lit', () => {
    render(<Visit />);
    expect(screen.getByRole('heading', { name: 'Athan Tsokolas’s wall' })).toBeInTheDocument();
    const wall = screen.getByRole('list', { name: 'Athan Tsokolas’s wall' });
    expect(within(wall).getAllByRole('listitem')).toHaveLength(2);
    expect(within(wall).getByText('AT.2016.1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'By Athan Tsokolas, On taste. Open.' }).closest('li')).toHaveClass('is-own');
  });

  it('opens a piece in its case with the reason, leaves the patch, and returns focus on Escape', () => {
    render(<Visit />);
    const frame = screen.getByRole('button', { name: 'Richard Hamming, You and Your Research. Open.' });
    fireEvent.click(frame);
    const vitrine = screen.getByRole('dialog', { name: 'You and Your Research' });
    expect(within(vitrine).getByText('It made me ask what matters.')).toBeInTheDocument();
    expect(within(vitrine).getByRole('link', { name: 'Read it' })).toHaveAttribute('href', 'https://example.com/hamming#:~:text=Work%20on%20the%20important%20problems.');
    expect(within(vitrine).getByRole('button', { name: 'Back to the wall' })).toHaveFocus();
    expect(frame.closest('li')).toHaveClass('is-out');
    fireEvent.keyDown(vitrine, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(frame).toHaveFocus();
  });

  it('walks the wall in hanging order and follows what a piece led to', () => {
    render(<Visit start="2016.1" />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'On taste' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'You and Your Research' }));
    expect(screen.getByRole('dialog', { name: 'You and Your Research' })).toBeInTheDocument();
  });

  it('says so when a shared piece was taken down', () => {
    render(<Visit start="2015.1" />);
    expect(screen.getByRole('status')).toHaveTextContent('This piece was taken down from the wall.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
