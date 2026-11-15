import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Pencil from './Pencil';

describe('Pencil', () => {
  it('names the agent and the day, and inks on request', () => {
    const onInk = jest.fn();
    render(<Pencil pencil={{ agent: 'Claude Code', at: '2026-11-15T12:00:00Z' }} verb="saved this" onInk={onInk} />);
    expect(screen.getByText(/In pencil: Claude Code saved this on Nov 15\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ink it' }));
    expect(onInk).toHaveBeenCalled();
  });

  it('says nothing about the reader\'s own writing', () => {
    const { container } = render(<Pencil pencil={null} onInk={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
