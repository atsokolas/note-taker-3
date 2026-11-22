import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Pencil, { cardOf } from './Pencil';

describe('Pencil', () => {
  it('signs what an agent wrote with its calling card, and inks on request', () => {
    const onInk = jest.fn();
    const at = new Date(2026, 10, 15, 14, 5).toISOString();
    render(<Pencil pencil={{ agent: 'Claude Code', at }} did="Saved" onInk={onInk} />);
    expect(screen.getByText(/^Saved in pencil/)).toHaveTextContent(/Saved in pencil — Claude Code, Nov 15, 2:05\sPM/);
    fireEvent.click(screen.getByRole('button', { name: 'Ink it' }));
    expect(onInk).toHaveBeenCalled();
  });

  it('says when it worked the night shift', () => {
    expect(cardOf({ agent: 'Codex', at: new Date(2026, 10, 15, 2, 14).toISOString() })).toMatch(/^— Codex, on the night shift, Nov 15, 2:14\sAM$/);
    expect(cardOf({})).toBe('— An agent');
  });

  it('says nothing about the reader\'s own writing', () => {
    const { container } = render(<Pencil pencil={null} onInk={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
