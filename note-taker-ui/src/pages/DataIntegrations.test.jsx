import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DataIntegrations from './DataIntegrations';
import api from '../api';
import { updateConcept } from '../api/concepts';
import {
  checkNotionConnection,
  checkReadwiseConnection,
  connectReadwiseToken,
  createImportSession,
  exportToNotionPage,
  getActiveImportSession,
  listImportConnections,
  previewNotionConnection,
  previewReadwiseConnection,
  startNotionOAuth,
  syncReadwiseConnection,
  syncNotionConnection,
  updateImportSession
} from '../api/imports';
import { createReturnQueueEntry } from '../api/returnQueue';

jest.mock('../api', () => ({
  __esModule: true,
  default: {
    post: jest.fn()
  }
}));

jest.mock('../api/concepts', () => ({
  updateConcept: jest.fn()
}));

jest.mock('../api/imports', () => ({
  checkNotionConnection: jest.fn(),
  checkReadwiseConnection: jest.fn(),
  connectReadwiseToken: jest.fn(),
  createImportSession: jest.fn(),
  exportToNotionPage: jest.fn(),
  getActiveImportSession: jest.fn(),
  listImportConnections: jest.fn(),
  previewNotionConnection: jest.fn(),
  previewReadwiseConnection: jest.fn(),
  startNotionOAuth: jest.fn(),
  syncReadwiseConnection: jest.fn(),
  syncNotionConnection: jest.fn(),
  updateImportSession: jest.fn()
}));

jest.mock('../api/returnQueue', () => ({
  createReturnQueueEntry: jest.fn()
}));

describe('DataIntegrations first insight workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    listImportConnections.mockResolvedValue([]);
    getActiveImportSession.mockResolvedValue(null);
    checkReadwiseConnection.mockResolvedValue({});
    checkNotionConnection.mockResolvedValue({});
    connectReadwiseToken.mockResolvedValue(null);
    startNotionOAuth.mockResolvedValue('');
    exportToNotionPage.mockResolvedValue({
      ok: true,
      page: {
        id: 'notion-page-1',
        url: 'https://notion.so/notion-page-1',
        title: 'My working note'
      }
    });
    previewReadwiseConnection.mockResolvedValue({});
    previewNotionConnection.mockResolvedValue({});
    createImportSession.mockResolvedValue({
      id: 'session-1',
      provider: 'files',
      status: 'draft',
      progress: { stage: 'draft', percent: 0, indexingState: 'not_started' },
      result: {},
      activation: {}
    });
    updateImportSession.mockImplementation(async (_id, payload) => ({
      id: 'session-1',
      provider: 'files',
      status: payload?.status || 'draft',
      progress: payload?.progress || { stage: 'draft', percent: 0, indexingState: 'not_started' },
      result: payload?.result || {},
      activation: payload?.activation || {}
    }));
    syncReadwiseConnection.mockResolvedValue({});
    syncNotionConnection.mockResolvedValue({});
  });

  it('creates a note, then lets the user create a concept and schedule a revisit', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        _id: 'note-1',
        title: 'My working note'
      }
    });
    updateConcept.mockResolvedValue({
      _id: 'concept-1',
      name: 'Retrieval systems'
    });
    createReturnQueueEntry.mockResolvedValue({
      _id: 'rq-1'
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Files and text/i }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My working note' } });
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'A useful capture that should become an insight.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create note' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(
      '/api/notebook',
      expect.objectContaining({
        title: 'My working note',
        source: 'manual-note',
        importMeta: expect.objectContaining({
          provider: 'files',
          sourceType: 'manual-note'
        })
      }),
      expect.any(Object)
    );

    await waitFor(() => expect(screen.getByTestId('first-insight-card')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('first-insight-concept-input'), { target: { value: 'Retrieval systems' } });
    fireEvent.click(screen.getByTestId('first-insight-create-concept'));

    await waitFor(() => expect(updateConcept).toHaveBeenCalledWith('Retrieval systems', { description: '' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open concept' })).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('first-insight-schedule-3d'));

    await waitFor(() => expect(createReturnQueueEntry).toHaveBeenCalledTimes(1));
    expect(createReturnQueueEntry).toHaveBeenCalledWith(expect.objectContaining({
      itemType: 'concept',
      itemId: 'concept-1',
      reason: 'First insight follow-up'
    }));
  });

  it('previews a Readwise connection before syncing', async () => {
    listImportConnections.mockImplementation(async ({ provider } = {}) => {
      if (provider === 'readwise') {
        return [{
          id: 'rw-1',
          provider: 'readwise',
          accountLabel: 'Reader',
          status: 'connected',
          lastSyncAt: null,
          lastError: ''
        }];
      }
      return [];
    });
    createImportSession.mockResolvedValue({
      id: 'session-readwise',
      provider: 'readwise',
      status: 'draft',
      sourceLabel: 'Reader',
      progress: { stage: 'draft', percent: 0, indexingState: 'not_started' },
      result: {},
      activation: {}
    });
    previewReadwiseConnection.mockResolvedValue({
      preview: {
        items: 5,
        articles: 2,
        highlights: 5,
        sampleTitles: ['Deep Work', 'Systems Thinking'],
        warnings: ['Preview is sampled from the first page of your Readwise export.']
      },
      session: {
        id: 'session-readwise',
        provider: 'readwise',
        status: 'preview_ready',
        sourceLabel: 'Reader',
        preview: {
          items: 5,
          articles: 2,
          highlights: 5,
          sampleTitles: ['Deep Work', 'Systems Thinking'],
          warnings: ['Preview is sampled from the first page of your Readwise export.']
        },
        progress: { stage: 'preview_ready', percent: 15, indexingState: 'not_started' }
      }
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    await screen.findByText('Label: Reader');
    fireEvent.click(screen.getByRole('button', { name: 'Preview scope' }));

    await waitFor(() => expect(previewReadwiseConnection).toHaveBeenCalledWith({
      connectionId: 'rw-1',
      importSessionId: 'session-readwise'
    }));
    expect(await screen.findByText('Preview snapshot')).toBeInTheDocument();
    expect(screen.getByText(/Deep Work/)).toBeInTheDocument();
  });

  it('checks a saved Readwise connection without starting sync', async () => {
    listImportConnections.mockImplementation(async ({ provider } = {}) => {
      if (provider === 'readwise') {
        return [{
          id: 'rw-1',
          provider: 'readwise',
          accountLabel: 'Reader',
          status: 'connected',
          lastValidatedAt: null,
          lastSyncAt: null,
          lastError: ''
        }];
      }
      return [];
    });
    checkReadwiseConnection.mockResolvedValue({
      ok: true,
      connection: {
        id: 'rw-1',
        provider: 'readwise',
        accountLabel: 'Reader',
        status: 'connected',
        lastValidatedAt: '2026-03-17T12:00:00.000Z',
        lastSyncAt: null,
        lastError: ''
      }
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    await screen.findByText('Label: Reader');
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }));

    await waitFor(() => expect(checkReadwiseConnection).toHaveBeenCalledWith({
      connectionId: 'rw-1'
    }));
    expect(await screen.findByText('Readwise connection is healthy.')).toBeInTheDocument();
  });

  it('renders source-aware activation guidance for a Readwise import', async () => {
    localStorage.setItem('first-insight.activation.v1', JSON.stringify({
      status: 'captured',
      sourceType: 'readwise-api',
      title: 'Reader',
      articleId: 'article-1',
      counts: {
        importedArticles: 2,
        importedHighlights: 5,
        importedNotes: 0
      },
      createdAt: '2026-03-17T12:00:00.000Z',
      updatedAt: '2026-03-17T12:00:00.000Z'
    }));
    getActiveImportSession.mockResolvedValue({
      id: 'session-readwise',
      provider: 'readwise',
      status: 'completed',
      sourceLabel: 'Reader',
      preview: {
        sampleTitles: ['Deep Work'],
        sampleTags: ['Attention', 'Systems Thinking']
      },
      result: {
        importedArticles: 2,
        importedHighlights: 5,
        importedNotes: 0,
        lastImportedArticleId: 'article-1'
      },
      activation: {
        status: 'captured',
        primaryAction: 'create_concept'
      }
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    expect(await screen.findByText('Activate your Readwise import')).toBeInTheDocument();
    expect(screen.getByText('Create a concept from books, tags, or highlights')).toBeInTheDocument();
    expect(screen.getByText('Keep the reading layer active')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Attention')).toBeInTheDocument();
  });

  it('exports the active note to Notion when a workspace is connected', async () => {
    localStorage.setItem('first-insight.activation.v1', JSON.stringify({
      status: 'captured',
      sourceType: 'manual-note',
      title: 'My working note',
      notebookEntryId: 'note-1',
      conceptId: '',
      conceptName: '',
      articleId: '',
      dueAt: '',
      createdAt: '2026-04-17T10:00:00.000Z',
      updatedAt: '2026-04-17T10:00:00.000Z',
      counts: {
        importedArticles: 0,
        importedHighlights: 0,
        importedNotes: 1
      }
    }));

    listImportConnections.mockImplementation(async ({ provider } = {}) => {
      if (provider === 'notion') {
        return [{
          id: 'notion-1',
          provider: 'notion',
          accountLabel: 'Product HQ',
          status: 'connected',
          lastValidatedAt: null,
          lastSyncAt: null,
          lastError: ''
        }];
      }
      return [];
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Export note to Notion' }));

    await waitFor(() => expect(exportToNotionPage).toHaveBeenCalledWith({
      connectionId: 'notion-1',
      entityType: 'notebook',
      conceptName: '',
      notebookEntryId: 'note-1'
    }));
    expect(await screen.findByText('Exported "My working note" to Notion.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My working note' })).toHaveAttribute('href', 'https://notion.so/notion-page-1');
  });

  it('routes csv uploads from the files flow through the Readwise CSV importer', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        importedArticles: 2,
        importedHighlights: 4,
        importedNotes: 0,
        skippedRows: 0,
        articleIds: ['article-1'],
        indexingQueued: 2,
        indexingAttempts: 2,
        indexingFailures: 0,
        warningCodes: [],
        warnings: []
      }
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Files and text/i }));
    const fileInput = screen.getByLabelText('Markdown or CSV upload');
    const csvFile = new File(['title,author\nDeep Work,Cal Newport'], 'readwise-export.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [csvFile] } });

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(
      '/api/import/readwise-csv',
      expect.any(FormData),
      expect.any(Object)
    );
    expect(await screen.findByText('CSV import complete.')).toBeInTheDocument();
  });

  it('shows an inline setup warning when Notion OAuth is not configured on the server', async () => {
    startNotionOAuth.mockRejectedValue({
      response: {
        data: {
          error: 'Notion OAuth is not configured on the server. Missing NOTION_CLIENT_ID and NOTION_CLIENT_SECRET.',
          missingEnv: ['NOTION_CLIENT_ID', 'NOTION_CLIENT_SECRET']
        }
      }
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Notion/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect Notion' }));

    const inlineWarning = await screen.findByTestId('notion-setup-warning');
    expect(inlineWarning).toBeInTheDocument();
    expect(within(inlineWarning).getByText(/This button is the Notion connection flow/)).toBeInTheDocument();
    expect(within(inlineWarning).getByText(/NOTION_CLIENT_ID and NOTION_CLIENT_SECRET/)).toBeInTheDocument();
  });

  it('polls an importing session until a terminal status is available', async () => {
    jest.useFakeTimers();
    getActiveImportSession
      .mockResolvedValueOnce({
        id: 'session-notion',
        provider: 'notion',
        status: 'importing',
        sourceLabel: 'Product HQ',
        progress: { stage: 'fetching_notion', percent: 0, indexingState: 'not_started' },
        result: {},
        activation: {}
      })
      .mockResolvedValueOnce({
        id: 'session-notion',
        provider: 'notion',
        status: 'completed',
        sourceLabel: 'Product HQ',
        progress: { stage: 'import_complete', percent: 100, indexingState: 'queued' },
        result: {
          importedNotes: 2,
          lastImportedEntryId: 'note-1'
        },
        activation: {
          status: 'captured',
          primaryAction: 'create_concept'
        }
      });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    expect(await screen.findByText('fetching_notion')).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => expect(getActiveImportSession).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Notion import complete\./)).toBeInTheDocument();

    jest.useRealTimers();
  });
});
