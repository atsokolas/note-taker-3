import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DataIntegrations from './DataIntegrations';
import api from '../api';
import { chatWithAgent } from '../api/agent';
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

jest.mock('../api/agent', () => ({
  chatWithAgent: jest.fn()
}));

jest.mock('../hooks/integrations/useAgentBridge', () => () => ({
  bridgeActorType: 'byo_agent',
  setBridgeActorType: jest.fn(),
  bridgeActorId: '',
  setBridgeActorId: jest.fn(),
  bridgeScope: 'agent_ops',
  setBridgeScope: jest.fn(),
  bridgeTtl: 1800,
  setBridgeTtl: jest.fn(),
  bridgeBusy: false,
  bridgeError: '',
  bridgeToken: '',
  bridgeManifestLoading: false,
  bridgeManifestError: '',
  bridgeManifest: null,
  bridgeHealth: null,
  bridgeAccessCheckLoading: false,
  bridgeAccessCheckError: '',
  bridgeCopyStatus: '',
  bridgeMeta: { scope: 'agent_ops', expiresInSec: 1800 },
  protocolApprovals: [],
  protocolApprovalsLoading: false,
  protocolApprovalsError: '',
  protocolApprovalBusyId: '',
  handleCreateBridgeToken: jest.fn(),
  handleTestBridgeConnection: jest.fn(),
  handleRunBridgeAccessCheck: jest.fn(),
  handleForgetBridgeHealth: jest.fn(),
  handleCopyBridgeConfig: jest.fn(),
  handleApproveProtocolApproval: jest.fn(),
  handleRejectProtocolApproval: jest.fn()
}));

jest.mock('../hooks/integrations/usePersonalAgents', () => () => ({
  sortedAgents: []
}));

jest.mock('../utils/marketingAnalytics', () => ({
  trackActivationMilestone: jest.fn()
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
    chatWithAgent.mockResolvedValue({});
  });

  it('marks the import surface as a scrollable settings-style page', async () => {
    const { container } = render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    expect(await screen.findByText('Bring your knowledge')).toBeInTheDocument();
    expect(container.querySelector('.ui-page')).toHaveClass('settings-page', 'data-integrations-page');
  });

  it('keeps the OpenClaw and Hermes agent bridge behind advanced setup on the active integrations route', async () => {
    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    expect(await screen.findByText('Need OpenClaw or Hermes?')).toBeInTheDocument();
    expect(screen.queryByText('Connect OpenClaw or Hermes')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show advanced bridge' }));

    expect(await screen.findByText('Connect OpenClaw or Hermes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Best for delegated research/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MCP-first runtime/i })).toBeInTheDocument();
  });

  it('shows organize this import action after a completed import session', async () => {
    getActiveImportSession.mockResolvedValue({
      id: 'session-1',
      provider: 'notion',
      status: 'completed',
      sourceLabel: 'Workspace import',
      recommendedNextAction: 'organize_import'
    });
    chatWithAgent.mockResolvedValue({
      thread: {
        threadId: 'thread-1'
      }
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Organize this import' }));

    await waitFor(() => expect(chatWithAgent).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Organize this import for me and stage a reviewable cleanup plan.',
      persistThread: true,
      context: {
        type: 'import_session',
        id: 'session-1',
        title: 'notion import'
      }
    })));
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

    expect(await screen.findByTestId('first-insight-card')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('first-insight-concept-input'), { target: { value: 'Retrieval systems' } });
    fireEvent.click(screen.getByTestId('first-insight-create-concept'));

    await waitFor(() => expect(updateConcept).toHaveBeenCalledWith('Retrieval systems', { description: '' }));
    expect(await screen.findByRole('button', { name: 'Open concept' })).toBeInTheDocument();

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

  it('shows the Readwise token helper link inside the guided connect flow', async () => {
    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    const tokenLink = await screen.findByRole('link', { name: 'Get Readwise token' });
    expect(tokenLink).toHaveAttribute('href', 'https://readwise.io/access_token');
    expect(screen.getByText(/Step 1: get your token/)).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole('button', { name: /Notion.*Import pages plus database row content/s }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export current note to Notion' }));

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

  it('guides Evernote ENEX import and shows a destination receipt after import', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        importedNotes: 2,
        entryId: 'note-evernote-1',
        duplicateSkips: 1,
        invalidSkips: 0,
        warningCodes: [],
        warnings: [],
        indexingQueued: 2,
        indexingAttempts: 2,
        indexingFailures: 0,
        indexingState: 'queued'
      }
    });

    const { container } = render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Evernote/i }));
    expect(await screen.findByRole('link', { name: 'Evernote export instructions' })).toHaveAttribute(
      'href',
      'https://help.evernote.com/hc/en-us/articles/209005557-Export-Notes-and-Notebooks-as-ENEX-or-HTML'
    );
    expect(screen.getByText(/This is a one-time import path today/)).toBeInTheDocument();

    const fileInput = container.querySelector('input[accept=".enex,application/xml,text/xml"]');
    expect(fileInput).not.toBeNull();
    const enexFile = new File(['<en-export></en-export>'], 'Research Notebook.enex', { type: 'text/xml' });
    fireEvent.change(fileInput, { target: { files: [enexFile] } });
    fireEvent.click(screen.getByRole('button', { name: 'Import ENEX' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/import/evernote-enex',
      expect.any(FormData),
      expect.any(Object)
    ));
    const receipt = await screen.findByTestId('import-receipt');
    expect(receipt).toBeInTheDocument();
    expect(receipt.textContent).toMatch(/mirrored/i);
    expect(receipt.textContent).toMatch(/folder/i);
    expect(screen.getByRole('button', { name: 'Open first imported note' })).toBeInTheDocument();
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
