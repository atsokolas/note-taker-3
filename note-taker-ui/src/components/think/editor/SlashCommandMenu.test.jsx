import React from 'react';
import { render, screen } from '@testing-library/react';
import SlashCommandMenu from './SlashCommandMenu';

const sampleItems = Array.from({ length: 8 }).map((_, i) => ({
  id: `cmd-${i}`,
  label: `Command ${i}`,
  description: `Insert command ${i} into the document`
}));

describe('SlashCommandMenu', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SlashCommandMenu open={false} items={sampleItems} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an empty state when a slash query has no matches', () => {
    render(<SlashCommandMenu open items={[]} query="zzz" />);
    expect(screen.getByText('No commands found')).toBeInTheDocument();
    expect(screen.getByText('Try a different keyword for "/zzz".')).toBeInTheDocument();
    // No keyboard hint footer when there are no items
    expect(screen.queryByText('navigate')).not.toBeInTheDocument();
  });

  it('renders items, marks the active one, and shows keyboard hints', () => {
    render(<SlashCommandMenu open items={sampleItems} activeIndex={2} />);
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(8);
    expect(items[2].className).toMatch(/is-active/);
    expect(items[2].getAttribute('aria-current')).toBe('true');
    expect(items[0].getAttribute('aria-current')).toBeNull();

    // ↵ hint only on the active item
    expect(items[2].textContent).toContain('↵');
    expect(items[0].textContent).not.toContain('↵');

    // Footer hints render
    expect(screen.getByText('navigate')).toBeInTheDocument();
    expect(screen.getByText('select')).toBeInTheDocument();
    expect(screen.getByText('close')).toBeInTheDocument();
  });

  it('scrolls the active item into view when activeIndex changes', () => {
    const { rerender } = render(<SlashCommandMenu open items={sampleItems} activeIndex={0} />);
    const items = screen.getAllByRole('menuitem');
    const scrollSpy = jest.fn();
    items[5].scrollIntoView = scrollSpy;

    rerender(<SlashCommandMenu open items={sampleItems} activeIndex={5} />);
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy.mock.calls[0][0]).toEqual({ block: 'nearest', behavior: 'auto' });
  });

  it('selects an item on click', () => {
    const onSelect = jest.fn();
    render(<SlashCommandMenu open items={sampleItems} activeIndex={0} onSelect={onSelect} />);
    const items = screen.getAllByRole('menuitem');
    items[3].click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('cmd-3');
  });
});
