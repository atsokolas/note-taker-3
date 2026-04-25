import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import InsertHighlightModal from './InsertHighlightModal';

const sample = [
  { _id: 'h1', articleTitle: 'Calm interfaces', text: 'A short passage about restraint.', tags: ['design'] },
  { _id: 'h2', articleTitle: 'Magnetic motion', text: 'Pointer-follow without disco.', tags: [] }
];

describe('InsertHighlightModal', () => {
  it('returns null when closed', () => {
    const { container } = render(
      <InsertHighlightModal open={false} highlights={sample} onClose={() => {}} onSelect={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('uses the insert variant on overlay and content for glass styling', () => {
    const { container } = render(
      <InsertHighlightModal open highlights={sample} onClose={() => {}} onSelect={() => {}} />
    );
    expect(container.querySelector('.modal-overlay--insert')).not.toBeNull();
    expect(container.querySelector('.modal-content--insert')).not.toBeNull();
  });

  it('filters highlights by query (text, article, tag)', () => {
    render(<InsertHighlightModal open highlights={sample} onClose={() => {}} onSelect={() => {}} />);
    const input = screen.getByPlaceholderText('Search highlights...');
    fireEvent.change(input, { target: { value: 'magnet' } });
    expect(screen.queryByText('Calm interfaces')).not.toBeInTheDocument();
    expect(screen.getByText('Magnetic motion')).toBeInTheDocument();
  });

  it('row click selects without firing twice from inner Insert button', () => {
    const onSelect = jest.fn();
    render(<InsertHighlightModal open highlights={sample} onClose={() => {}} onSelect={onSelect} />);
    const row = screen.getAllByRole('button', { name: /Calm interfaces/ })[0];
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]._id).toBe('h1');

    onSelect.mockClear();
    const insertBtn = screen.getAllByRole('button', { name: 'Insert' })[1]; // second row's Insert
    fireEvent.click(insertBtn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]._id).toBe('h2');
  });

  it('row Enter key selects', () => {
    const onSelect = jest.fn();
    render(<InsertHighlightModal open highlights={sample} onClose={() => {}} onSelect={onSelect} />);
    const row = screen.getAllByRole('button', { name: /Calm interfaces/ })[0];
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('shows the keyboard close hint in the footer', () => {
    render(<InsertHighlightModal open highlights={sample} onClose={() => {}} onSelect={() => {}} />);
    expect(screen.getByText('to close')).toBeInTheDocument();
  });

  it('calls onClose from both footer Close button and header × button', () => {
    const onClose = jest.fn();
    const { container } = render(
      <InsertHighlightModal open highlights={sample} onClose={onClose} onSelect={() => {}} />
    );
    // Footer Close (text)
    const footerClose = screen.getAllByRole('button', { name: 'Close' }).find(
      (b) => !b.classList.contains('icon-button')
    );
    fireEvent.click(footerClose);
    // Header ×
    fireEvent.click(container.querySelector('.icon-button'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
