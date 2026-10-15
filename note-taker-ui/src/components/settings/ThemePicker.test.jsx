import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ThemePicker from './ThemePicker';

const renderPicker = (props = {}) => {
  const handlers = { onPreview: jest.fn(), onConfirm: jest.fn(), onCancel: jest.fn() };
  render(<ThemePicker open value="tokyo-midnight" {...handlers} {...props} />);
  return handlers;
};

describe('ThemePicker', () => {
  it('lists Noeis themes and the ten community favorites, with the current one chosen', () => {
    renderPicker();
    expect(screen.getAllByRole('radio')).toHaveLength(14);
    expect(screen.getByRole('radio', { name: 'Tokyo Midnight' })).toHaveAttribute('aria-checked', 'true');
    ['Tokyo Night', 'Catppuccin', 'Dracula', 'Nord', 'Gruvbox Dark', 'Rosé Pine', 'Everforest', 'Monokai', 'Solarized Dark', 'Solarized Light']
      .forEach((name) => expect(screen.getByRole('radio', { name })).toBeInTheDocument());
  });

  it('narrows by scheme and by name', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /Light/ }));
    expect(screen.getAllByRole('radio').map((node) => node.textContent)).toEqual(['Light', 'Solarized Light']);
    expect(screen.getByText('2 themes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Find a theme'), { target: { value: 'rosé' } });
    expect(screen.getAllByRole('radio').map((node) => node.textContent)).toEqual(['Rosé Pine']);
  });

  it('applies a choice at once, keeps it on Looks good, and names what Escape puts back', () => {
    const { onPreview, onConfirm } = renderPicker();
    fireEvent.click(screen.getByRole('radio', { name: 'Dracula' }));
    expect(onPreview).toHaveBeenCalledWith('dracula');
    expect(screen.getByText('Applied live · Esc puts back Tokyo Midnight')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Looks good/ }));
    expect(onConfirm).toHaveBeenCalledWith('dracula');
  });

  it('clears the search first, then puts back the theme it opened on', () => {
    const { onCancel } = renderPicker();
    const search = screen.getByLabelText('Find a theme');
    fireEvent.change(search, { target: { value: 'nord' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Nord' }));
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledWith('tokyo-midnight');
  });

  it('moves through the grid with the arrow keys, previewing as it goes', () => {
    const { onPreview } = renderPicker({ value: 'light' });
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Light' }), { key: 'ArrowDown' });
    expect(onPreview).toHaveBeenLastCalledWith('tokyo-midnight');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Tokyo Midnight' }), { key: 'ArrowLeft' });
    expect(onPreview).toHaveBeenLastCalledWith('dark');
  });
});
