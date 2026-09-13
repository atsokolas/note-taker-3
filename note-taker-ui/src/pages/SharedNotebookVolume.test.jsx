import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SharedNotebookVolume from './SharedNotebookVolume';
import { getPublicVolume } from '../api/notebook';
import { volumeSnapshot } from '../components/think/notebook/notebookShareFixture';

jest.mock('../api/notebook', () => ({
  getPublicVolume: jest.fn()
}));
jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: () => ({ slug: 'volume-slug' })
}));

describe('a volume someone published', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the frozen collection, not a live workshop', async () => {
    getPublicVolume.mockResolvedValue(volumeSnapshot());
    render(<SharedNotebookVolume />);
    expect(await screen.findByText('Who pays?')).toBeInTheDocument();
    expect(screen.getByText('Two finished notes, one question.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Who gets to experiment, and who pays?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Whose downside?' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'A letter on time' })[0]).toHaveAttribute('href', 'https://example.com/letter');
    expect(screen.queryByRole('button', { name: 'Leave a question' })).not.toBeInTheDocument();
    expect(screen.getByText(/collected version that was published/)).toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  });

  it('prints the published volume', async () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => {});
    getPublicVolume.mockResolvedValue(volumeSnapshot());
    render(<SharedNotebookVolume />);
    fireEvent.click(await screen.findByRole('button', { name: 'Print this volume' }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('says nothing exists rather than that it was withdrawn', async () => {
    getPublicVolume.mockRejectedValue(new Error('gone'));
    render(<SharedNotebookVolume />);
    expect(await screen.findByText('This volume is not published.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Print this volume' })).not.toBeInTheDocument();
  });
});
