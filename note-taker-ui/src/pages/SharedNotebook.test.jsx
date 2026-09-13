import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SharedNotebook from './SharedNotebook';
import { getPublicNotebook } from '../api/notebook';
import { essaySnapshot } from '../components/think/notebook/notebookShareFixture';

jest.mock('../api/notebook', () => ({ getPublicNotebook: jest.fn() }));
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: () => ({ slug: 'essay-slug' })
}));

describe('a note someone published', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the frozen snapshot, not a live workshop', async () => {
    getPublicNotebook.mockResolvedValue(essaySnapshot());
    render(<SharedNotebook />);
    expect(await screen.findByText('Who gets to experiment, and who pays?')).toBeInTheDocument();
    expect(screen.getByText('Two hours a week cannot sustain this.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'A letter on time' })).toHaveAttribute('href', 'https://example.com/letter');
    expect(screen.getByRole('button', { name: 'Copy with source' })).toBeInTheDocument();
    expect(screen.getByText(/Later private edits do not change it/)).toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  });

  it('prints the published page, not the workshop chrome', async () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    getPublicNotebook.mockResolvedValue(essaySnapshot());
    render(<SharedNotebook />);
    fireEvent.click(await screen.findByRole('button', { name: 'Print this note' }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('says nothing exists rather than that it was withdrawn', async () => {
    getPublicNotebook.mockRejectedValue(new Error('gone'));
    render(<SharedNotebook />);
    expect(await screen.findByText('This note is not published.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Print this note' })).not.toBeInTheDocument();
  });

  it('says nothing while it is still opening', () => {
    getPublicNotebook.mockReturnValue(new Promise(() => {}));
    render(<SharedNotebook />);
    expect(screen.getByRole('status')).toHaveTextContent('Opening…');
    expect(screen.queryByRole('button', { name: 'Print this note' })).not.toBeInTheDocument();
  });
});
