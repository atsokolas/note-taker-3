import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import KeepPassage from './KeepPassage';
import { keepPassage } from '../../api/home';

jest.mock('../../api/home', () => ({ keepPassage: jest.fn() }));

describe('KeepPassage', () => {
  it('keeps a passage for good, and lets it go again', async () => {
    keepPassage.mockResolvedValueOnce({ keptAt: '2026-11-25T18:00:00Z' }).mockResolvedValueOnce({ keptAt: null });
    render(<KeepPassage articleId="a1" highlight={{ _id: 'h1', text: 'Invert, always invert.' }} label="Keep the passage for good" />);

    fireEvent.click(screen.getByRole('button', { name: 'Keep the passage for good' }));
    expect(await screen.findByRole('button', { name: 'Kept' })).toHaveAttribute('aria-pressed', 'true');
    expect(keepPassage).toHaveBeenCalledWith({ articleId: 'a1', highlightId: 'h1' }, true);

    fireEvent.click(screen.getByRole('button', { name: 'Kept' }));
    expect(await screen.findByRole('button', { name: 'Keep the passage for good' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows a passage already kept as kept', () => {
    render(<KeepPassage articleId="a1" highlight={{ _id: 'h1', text: 'x', keptAt: '2025-01-01' }} />);
    expect(screen.getByRole('button', { name: 'Kept' })).toBeInTheDocument();
  });
});
