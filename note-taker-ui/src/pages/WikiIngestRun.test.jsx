import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WikiIngestRun from './WikiIngestRun';
import { createWikiPage, getWikiIngestRun, undoWikiIngestRun } from '../api/wiki';

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useParams: () => ({ runId: 'run-1' })
}));

jest.mock('../api/wiki', () => ({
  createWikiPage: jest.fn(),
  getWikiIngestRun: jest.fn(),
  undoWikiIngestRun: jest.fn()
}));

describe('WikiIngestRun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getWikiIngestRun.mockResolvedValue({
      runId: 'run-1',
      status: 'processed',
      sourceRef: { title: 'Research memo' },
      affectedPageIds: ['wiki-1'],
      completedAt: '2026-05-04T12:00:00.000Z',
      summary: 'Updated one page.',
      timeline: [{
        id: 'timeline-1',
        type: 'revision',
        status: 'completed',
        title: 'source_event',
        summary: 'Updated Enterprise AI Memory.',
        pageId: 'wiki-1',
        at: '2026-05-04T12:00:00.000Z'
      }]
    });
    createWikiPage.mockResolvedValue({ _id: 'wiki-new', title: 'Unmatched source' });
    undoWikiIngestRun.mockResolvedValue({
      runId: 'run-1',
      status: 'processed',
      sourceRef: { title: 'Research memo' },
      affectedPageIds: ['wiki-1'],
      undoneAt: '2026-05-04T12:05:00.000Z',
      restoredPageIds: ['wiki-1'],
      timeline: []
    });
  });

  it('renders ingest run facts and timeline links', async () => {
    render(<WikiIngestRun />);

    expect(await screen.findByRole('heading', { name: 'Research memo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Ingest run facts')).toHaveTextContent('Processed');
    expect(screen.getByLabelText('Ingest run facts')).toHaveTextContent('1 pages touched');
    expect(screen.getByText('Updated Enterprise AI Memory.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open page' })).toHaveAttribute('href', '/wiki/wiki-1');
    expect(getWikiIngestRun).toHaveBeenCalledWith('run-1');
  });

  it('can undo an ingest run with affected pages', async () => {
    render(<WikiIngestRun />);

    fireEvent.click(await screen.findByRole('button', { name: 'Undo ingest' }));

    await waitFor(() => expect(undoWikiIngestRun).toHaveBeenCalledWith('run-1'));
    expect(await screen.findByText('Restored 1 page.')).toBeInTheDocument();
  });

  it('offers page creation when no matching pages were updated', async () => {
    getWikiIngestRun.mockResolvedValueOnce({
      runId: 'run-empty',
      status: 'ignored',
      sourceRef: { type: 'external', title: 'Unmatched source', summary: 'New material.' },
      affectedPageIds: [],
      suggestedCreatePage: {
        title: 'Unmatched source',
        source: { type: 'external', title: 'Unmatched source', snippet: 'New material.' }
      },
      timeline: []
    });

    render(<WikiIngestRun />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create wiki page' }));

    await waitFor(() => expect(createWikiPage).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Unmatched source',
      pageType: 'source'
    })));
    expect(await screen.findByText('Created "Unmatched source".')).toBeInTheDocument();
  });
});
