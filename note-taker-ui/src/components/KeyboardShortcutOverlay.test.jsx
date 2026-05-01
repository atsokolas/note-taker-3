import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import KeyboardShortcutOverlay from './KeyboardShortcutOverlay';

describe('KeyboardShortcutOverlay', () => {
  it('returns null when closed', () => {
    const { container } = render(<KeyboardShortcutOverlay open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders sections of shortcuts when open', () => {
    render(<KeyboardShortcutOverlay open onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: /Keyboard shortcuts/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Anywhere' })).toBeInTheDocument();
    expect(screen.getByText('Open command palette')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: /Go to/i })).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(<KeyboardShortcutOverlay open onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when clicking the overlay backdrop', () => {
    const onClose = jest.fn();
    const { container } = render(<KeyboardShortcutOverlay open onClose={onClose} />);
    const backdrop = container.querySelector('[data-testid="keyboard-shortcut-overlay"]');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the panel', () => {
    const onClose = jest.fn();
    render(<KeyboardShortcutOverlay open onClose={onClose} />);
    const panel = screen.getByRole('dialog', { name: /Keyboard shortcuts/i });
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes via the × button', () => {
    const onClose = jest.fn();
    render(<KeyboardShortcutOverlay open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
