import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DataIntegrations from './DataIntegrations';
import api from '../api';
import { chatWithAgent } from '../api/agent';
import { getEmbeddingJobStatus } from '../api/ai';
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
  startReadwiseOAuth,
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

jest.mock('../api/ai', () => ({
  getEmbeddingJobStatus: jest.fn()
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
  startReadwiseOAuth: jest.fn(),
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
    startReadwiseOAuth.mockResolvedValue('');
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
    getEmbeddingJobStatus.mockResolvedValue({
      status: 'ready',
      counts: { queued: 0, running: 0, failed: 0, abandoned: 0, completed: 0, total: 0 },
      failedJobs: []
    });
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

  it('shows which connected sources are feeding the return loop', async () => {
    listImportConnections.mockImplementation(async ({ provider } = {}) => {
      if (provider === 'readwise') {
        return [{
          id: 'rw-1',
          provider: 'readwise',
          accountLabel: 'Reader',
          mode: 'manual',
          status: 'connected',
          health: 'healthy',
          lastSyncAt: '2026-06-07T14:00:00.000Z',
          lastValidatedAt: '2026-06-07T13:00:00.000Z'
        }];
      }
      if (provider === 'notion') {
        return [{
          id: 'notion-1',
          provider: 'notion',
          accountLabel: 'Product HQ',
          status: 'connected',
          health: 'healthy',
          lastSyncAt: '2026-06-08T15:30:00.000Z'
        }];
      }
      return [];
    });
    getActiveImportSession.mockResolvedValue({
      id: 'session-evernote',
      provider: 'evernote',
      status: 'completed',
      sourceLabel: 'Research Notebook',
      updatedAt: '2026-06-09T12:00:00.000Z',
      result: {
        importedNotes: 4
      }
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    const card = await screen.findByTestId('connections-return-loop');
    expect(within(card).getByText('What is feeding Morning Paper?')).toBeInTheDocument();
    expect(within(card).getByText(/scheduled wiki maintenance checks due pages about every six hours/i)).toBeInTheDocument();
    expect(await within(card).findByText('Import feed active')).toBeInTheDocument();
    expect(within(card).getByText('Synced into Noeis')).toBeInTheDocument();
    expect(within(card).getByText('Last manual import saved')).toBeInTheDocument();
    expect(within(card).getByText(/Latest handoff: Evernote import on/i)).toBeInTheDocument();
  });

  it('marks source and return-loop cards with grayscale-safe connection state classes', async () => {
    listImportConnections.mockImplementation(async ({ provider } = {}) => {
      if (provider === 'readwise') {
        return [{
          id: 'rw-1',
          provider: 'readwise',
          accountLabel: 'Reader',
          mode: 'manual',
          status: 'connected',
          health: 'healthy',
          lastSyncAt: '2026-06-08T15:30:00.000Z'
        }];
      }
      if (provider === 'notion') {
        return [{
          id: 'notion-1',
          provider: 'notion',
          accountLabel: 'Product HQ',
          status: 'connected',
          health: 'healthy',
          lastValidatedAt: '2026-06-08T15:30:00.000Z'
        }];
      }
      return [];
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    const returnLoop = await screen.findByTestId('connections-return-loop');
    await waitFor(() => {
      expect(returnLoop.querySelector('.connections-return-loop__feed--connected')).toBeTruthy();
    });
    expect(returnLoop.querySelector('.connections-return-loop__feed--warning')).toBeTruthy();

    const readwiseCard = await screen.findByTestId('import-source-card-readwise');
    const notionCard = screen.getByTestId('import-source-card-notion');
    expect(readwiseCard).toHaveClass('import-source-card--connected');
    expect(notionCard).toHaveClass('import-source-card--warning');
    expect(readwiseCard).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(notionCard);
    expect(notionCard).toHaveAttribute('aria-pressed', 'true');
    expect(readwiseCard).toHaveAttribute('aria-pressed', 'false');
  });

  it('makes the Notion redirect and unsynced state explicit before OAuth', async () => {
    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Notion.*Import pages plus database row content/s }));

    const receipt = await screen.findByTestId('notion-sync-receipt');
    expect(within(receipt).getByText('Not connected')).toBeInTheDocument();
    expect(within(receipt).getByText(/Connect opens Notion in your browser/i)).toBeInTheDocument();
    expect(within(receipt).getByText(/After approval, Noeis returns here/i)).toBeInTheDocument();
    expect(screen.getByText('Live flow')).toBeInTheDocument();
  });

  it('shows a connected-but-not-synced Notion workspace as not yet in Noeis', async () => {
    listImportConnections.mockImplementation(async ({ provider } = {}) => {
      if (provider === 'notion') {
        return [{
          id: 'notion-1',
          provider: 'notion',
          accountLabel: 'Product HQ',
          status: 'connected',
          health: 'healthy',
          lastValidatedAt: '2026-06-08T15:30:00.000Z',
          lastSyncAt: null,
          lastPreviewAt: null
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

    const receipt = await screen.findByTestId('notion-sync-receipt');
    expect(within(receipt).getByText('Connected, not synced')).toBeInTheDocument();
    expect(within(receipt).getByText(/Share the pages or databases/i)).toBeInTheDocument();
    expect(screen.getByText(/Last sync:/)).toHaveTextContent('Last sync: Never');
  });

  it('shows where a synced Notion workspace lands in the product', async () => {
    getActiveImportSession.mockResolvedValue({
      id: 'session-notion-1',
      provider: 'notion',
      status: 'completed',
      result: {
        importedNotes: 3,
        skippedRows: 2,
        indexingQueued: 1,
        indexingFailures: 0
      }
    });
    listImportConnections.mockImplementation(async ({ provider } = {}) => {
      if (provider === 'notion') {
        return [{
          id: 'notion-1',
          provider: 'notion',
          accountLabel: 'Product HQ',
          status: 'connected',
          health: 'healthy',
          lastValidatedAt: '2026-06-08T15:00:00.000Z',
          lastSyncAt: '2026-06-08T15:30:00.000Z',
          lastPreviewAt: '2026-06-08T15:15:00.000Z'
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

    const receipt = await screen.findByTestId('notion-sync-receipt');
    expect(within(receipt).getByText('Synced into Noeis')).toBeInTheDocument();
    expect(within(receipt).getByText(/Imported pages are available as notebook entries/i)).toBeInTheDocument();
    expect(within(receipt).getByText(/Where it lands: Library search, Think retrieval, and Morning Paper source maintenance/i)).toBeInTheDocument();
    expect(within(receipt).getByText('Synced 3 pages · 2 skipped · 1 indexing.')).toBeInTheDocument();
  });

  it('shows durable Notion sync summary after reload without an active session', async () => {
    getActiveImportSession.mockResolvedValue(null);
    listImportConnections.mockImplementation(async ({ provider } = {}) => {
      if (provider === 'notion') {
        return [{
          id: 'notion-1',
          provider: 'notion',
          accountLabel: 'Product HQ',
          status: 'connected',
          health: 'healthy',
          lastValidatedAt: '2026-06-08T15:00:00.000Z',
          lastSyncAt: '2026-06-08T15:30:00.000Z',
          lastPreviewAt: '2026-06-08T15:15:00.000Z',
          lastSyncResult: {
            importedNotes: 5,
            skippedRows: 1,
            indexingQueued: 2,
            indexingFailures: 0,
            completedAt: '2026-06-08T15:30:00.000Z'
          }
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

    const receipt = await screen.findByTestId('notion-sync-receipt');
    expect(within(receipt).getByText('Synced into Noeis')).toBeInTheDocument();
    expect(within(receipt).getByText(/Last synced Jun 8, 2026 · 5 pages/i)).toBeInTheDocument();
    expect(within(receipt).getByText('Synced 5 pages · 1 skipped · 2 indexing.')).toBeInTheDocument();
  });

  it('surfaces persisted semantic indexing warnings from connection sync results', async () => {
    getActiveImportSession.mockResolvedValue(null);
    listImportConnections.mockImplementation(async ({ provider } = {}) => {
      if (provider === 'notion') {
        return [{
          id: 'notion-1',
          provider: 'notion',
          accountLabel: 'Product HQ',
          status: 'connected',
          health: 'healthy',
          lastSyncAt: '2026-06-08T15:30:00.000Z',
          lastSyncResult: {
            importedNotes: 2,
            indexingFailures: 2
          }
        }];
      }
      return [];
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    const notice = await screen.findByText('Semantic indexing needs another pass');
    expect(notice).toBeInTheDocument();
    expect(screen.getByText(/2 semantic indexing warnings reported from Notion/i)).toBeInTheDocument();
  });

  it('surfaces real background embedding job failures independently of import counters', async () => {
    getActiveImportSession.mockResolvedValue(null);
    listImportConnections.mockResolvedValue([]);
    getEmbeddingJobStatus.mockResolvedValue({
      status: 'warning',
      counts: { queued: 0, running: 0, failed: 1, abandoned: 1, completed: 3, total: 5 },
      failedJobs: [{
        id: 'job-1',
        collection: 'articles',
        objectId: 'article-1',
        status: 'failed',
        lastError: 'HF 429 rate limit exceeded'
      }]
    });

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    const notice = await screen.findByText('Background indexing needs a retry');
    expect(notice).toBeInTheDocument();
    expect(screen.getByText(/2 background indexing jobs need retry/i)).toBeInTheDocument();
    expect(screen.getByText(/Latest: articles — HF 429 rate limit exceeded/i)).toBeInTheDocument();
  });

  it('explains why Evernote uses ENEX instead of browser OAuth today', async () => {
    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Evernote.*Keep notebook migrations clean/s }));

    expect(screen.getByText('Fastest self-serve path')).toBeInTheDocument();
    expect(screen.getByText(/Browser OAuth sync is technically possible/i)).toBeInTheDocument();
    expect(screen.getByText(/Evernote requires reviewed API access/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Evernote export instructions' })).toHaveAttribute(
      'href',
      'https://help.evernote.com/hc/en-us/articles/209005557-Export-Notes-and-Notebooks-as-ENEX-or-HTML'
    );
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

  it('shows Readwise browser approval as the recommended connect flow with token fallback', async () => {
    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Recommended: browser approval/i)).toBeInTheDocument();
    expect(screen.getByText(/You do not need to paste an API token/i)).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/mcp2\.readwise\.io\/mcp/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Readwise MCP setup' })).toHaveAttribute('href', 'https://docs.readwise.io/tools/mcp');
    fireEvent.click(screen.getByText(/Advanced: direct sync with API token/i));
    const tokenLink = await screen.findByRole('link', { name: 'Get Readwise token' });
    expect(tokenLink).toHaveAttribute('href', 'https://readwise.io/access_token');
  });

  it('starts Readwise browser authorization without requiring an API token', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    startReadwiseOAuth.mockResolvedValue('https://readwise.io/o/authorize/?client_id=noeis');

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Connect with Readwise' }));

    await waitFor(() => expect(startReadwiseOAuth).toHaveBeenCalledTimes(1));
    expect(openSpy).toHaveBeenCalledWith(
      'https://readwise.io/o/authorize/?client_id=noeis',
      '_self',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });

  it('shows MCP browser access as agent retrieval and keeps direct sync paused until token setup', async () => {
    listImportConnections.mockImplementation(async ({ provider } = {}) => (
      provider === 'readwise'
        ? [{
          id: 'rw-mcp-1',
          provider: 'readwise',
          mode: 'mcp_remote',
          accountLabel: 'Readwise MCP',
          status: 'connected',
          health: 'healthy',
          externalAccountId: 'https://mcp2.readwise.io/mcp'
        }]
        : []
    ));

    render(
      <MemoryRouter>
        <DataIntegrations />
      </MemoryRouter>
    );

    expect(await screen.findByText('Agent access: connected')).toBeInTheDocument();
    expect(screen.getByText(/Direct import: add an API token or CSV/i)).toBeInTheDocument();
    const returnLoopCard = screen.getByTestId('connections-return-loop');
    expect(within(returnLoopCard).getByText('Agent access connected')).toBeInTheDocument();
    expect(within(returnLoopCard).getByText(/Direct Library refresh still needs the advanced token sync or a CSV import/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload Readwise CSV' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add API token' })).toHaveAttribute('href', 'https://readwise.io/access_token');
    fireEvent.click(screen.getByText(/Advanced: direct sync with API token/i));
    expect(screen.getByText(/Browser access is connected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync from Readwise' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Preview scope' })).toBeDisabled();
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
    expect(screen.getByText(/ENEX is the reliable path you can use today without waiting on vendor approval/)).toBeInTheDocument();

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
