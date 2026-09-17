import React from 'react';
import { render, screen, within } from '@testing-library/react';
import ConnectionsActivity from './ConnectionsActivity';
import { listImportSessions } from '../../api/imports';

jest.mock('../../api/imports', () => ({
  listImportSessions: jest.fn()
}));

describe('Connections activity', () => {
  beforeEach(() => {
    listImportSessions.mockResolvedValue([
      {
        id: 'session-1',
        provider: 'readwise',
        status: 'completed_with_warnings',
        updatedAt: '2026-09-17T10:04:00.000Z',
        result: {
          importedArticles: 3,
          importedHighlights: 12,
          skippedRows: 1,
          indexingFailures: 1
        },
        receipt: {
          id: 'receipt-1',
          summary: '3 sources and 12 highlights saved. 1 indexing issue.'
        }
      },
      {
        id: 'session-2',
        provider: 'notion',
        status: 'completed',
        updatedAt: '2026-09-16T09:00:00.000Z',
        result: {
          importedNotes: 0,
          skippedRows: 4
        }
      }
    ]);
  });

  it('shows durable import outcomes and agent-use evidence in time order', async () => {
    render(
      <ConnectionsActivity
        tokens={[{
          id: 'token-1',
          label: 'Research companion',
          scopes: ['read'],
          status: 'active',
          lastUsedAt: '2026-09-17T11:00:00.000Z'
        }]}
      />
    );

    expect(await screen.findByRole('heading', { name: 'A record you can come back to' })).toBeInTheDocument();
    expect((await screen.findAllByText('Saved with follow-up needed')).length).toBeGreaterThan(0);
    const rows = screen.getAllByRole('article');
    expect(within(rows[0]).getByText('Research companion used NOEIS')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/successful request was received/i)).toBeInTheDocument();
    expect(screen.getByText(/1 search retry needed/i)).toBeInTheDocument();
    expect(screen.getByText('No new material')).toBeInTheDocument();
    expect(screen.getByText(/4 unchanged or skipped/i)).toBeInTheDocument();
    expect(listImportSessions).toHaveBeenCalledWith({ limit: 30 });
  });
});
