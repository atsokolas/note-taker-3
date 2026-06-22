import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Button, Card, Page } from '../components/ui';
import { chatWithAgent, fetchNotionPagesViaAgent } from '../api/agent';
import ExternalBridgeCard from '../components/integrations/ExternalBridgeCard';
import NotionAgentFetchCard from '../components/integrations/NotionAgentFetchCard';
import { updateConcept, getConcepts } from '../api/concepts';
import { getAllHighlights } from '../api/highlights';
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
import { AGENT_DISPLAY_NAME } from '../constants/agentIdentity';
import {
  clearFirstInsightState,
  getFirstInsightOpenPath,
  getFirstInsightSummary,
  isFirstInsightActive,
  readFirstInsightState,
  saveFirstInsightState,
  updateFirstInsightState
} from '../utils/firstInsight';
import useAgentBridge from '../hooks/integrations/useAgentBridge';
import usePersonalAgents from '../hooks/integrations/usePersonalAgents';
import { trackActivationMilestone } from '../utils/marketingAnalytics';
import { composeReadwiseConnectMoment, countActiveConcepts } from '../utils/connectionMagicMoment';

const SOURCE_OPTIONS = [
  {
    key: 'readwise',
    title: 'Readwise',
    subtitle: 'Bring in highlights and notes from your reading layer.',
    status: 'Available today',
    helper: 'Connect through browser approval first; token sync and CSV remain available as direct Noeis fallbacks.'
  },
  {
    key: 'notion',
    title: 'Notion',
    subtitle: 'Import pages plus database row content into notebook-ready text.',
    status: 'Available today',
    helper: 'OAuth connect, preview, and direct sync are live for accessible pages and database content.'
  },
  {
    key: 'evernote',
    title: 'Evernote',
    subtitle: 'Keep notebook migrations clean instead of flattening everything into one dump.',
    status: 'Available today',
    helper: 'ENEX import uses the same session, indexing, and activation flow as the direct providers.'
  },
  {
    key: 'files',
    title: 'Files and text',
    subtitle: 'Paste or upload markdown/plain text when you need a quick path.',
    status: 'Available today',
    helper: 'Useful for exports, clipped text, and one-off notes while direct connections are being added.'
  }
];

const EVERNOTE_EXPORT_HELP_URL = 'https://help.evernote.com/hc/en-us/articles/209005557-Export-Notes-and-Notebooks-as-ENEX-or-HTML';
const READWISE_MCP_DOCS_URL = 'https://docs.readwise.io/tools/mcp';
const READWISE_MCP_SERVER_URL = 'https://mcp2.readwise.io/mcp';
const READWISE_TOKEN_HELP_URL = 'https://readwise.io/access_token';

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

const createBlockId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `block-${Math.random().toString(36).slice(2, 9)}-${Date.now()}`;
};

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const parseTagList = (value = '') =>
  String(value || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
    .filter((tag, index, list) => list.findIndex(item => item.toLowerCase() === tag.toLowerCase()) === index);

const buildBlocksFromText = (text = '') => {
  const lines = String(text || '').split(/\r?\n/);
  const blocks = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = trimmed.slice(2).trim();
      if (!bulletText) return;
      blocks.push({
        id: createBlockId(),
        type: 'bullet',
        indent: 0,
        text: bulletText
      });
      return;
    }
    blocks.push({
      id: createBlockId(),
      type: 'paragraph',
      text: trimmed
    });
  });

  return blocks;
};

const buildHtmlFromText = (text = '') => {
  const lines = String(text || '').split(/\r?\n/);
  const htmlParts = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    htmlParts.push(`<ul>${listItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(trimmed.slice(2).trim());
      return;
    }
    flushList();
    htmlParts.push(`<p>${escapeHtml(trimmed)}</p>`);
  });

  flushList();
  return htmlParts.join('');
};

const detectPasteMode = (text = '') => {
  const value = String(text || '').trim();
  if (!value) return 'plain';

  const nonEmptyLines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const markdownSignals = [
    /^#{1,6}\s+/m,
    /^>\s+/m,
    /^[-*]\s+/m,
    /^\d+\.\s+/m,
    /```/m
  ];
  if (markdownSignals.some(pattern => pattern.test(value))) {
    return 'markdown';
  }

  if (nonEmptyLines.length >= 2) {
    const commaCounts = nonEmptyLines.slice(0, 3).map(line => (line.match(/,/g) || []).length);
    if (commaCounts.every(count => count > 0)) {
      return 'csv';
    }
  }

  return 'plain';
};

const detectUploadMode = (file) => {
  const name = String(file?.name || '').trim().toLowerCase();
  const type = String(file?.type || '').trim().toLowerCase();
  if (name.endsWith('.csv') || type.includes('csv')) return 'csv';
  if (name.endsWith('.md') || name.endsWith('.markdown') || type.includes('markdown')) return 'markdown';
  return '';
};

const makeSummaryFromCsvResponse = (responseData = {}) => ({
  importedArticles: responseData.importedArticles || 0,
  importedHighlights: responseData.importedHighlights || 0,
  importedNotes: responseData.importedNotes || 0,
  skippedRows: responseData.skippedRows || 0,
  duplicateSkips: responseData.duplicateSkips || 0,
  invalidSkips: responseData.invalidSkips || 0,
  parseErrors: responseData.parseErrors || 0,
  entryId: '',
  articleIds: Array.isArray(responseData.articleIds) ? responseData.articleIds : [],
  indexingQueued: responseData.indexingQueued || 0,
  indexingAttempts: responseData.indexingAttempts || 0,
  indexingFailures: responseData.indexingFailures || 0,
  indexingState: responseData.indexingState || 'not_started',
  warningCodes: Array.isArray(responseData.warningCodes) ? responseData.warningCodes : [],
  warnings: Array.isArray(responseData.warnings) ? responseData.warnings : []
});

const makeSummaryFromNoteResponse = (responseData = {}) => ({
  importedArticles: 0,
  importedHighlights: 0,
  importedNotes: responseData.importedNotes || 1,
  skippedRows: 0,
  duplicateSkips: responseData.duplicateSkips || 0,
  invalidSkips: responseData.invalidSkips || 0,
  parseErrors: 0,
  entryId: String(responseData.entryId || responseData._id || ''),
  articleIds: [],
  indexingQueued: responseData.indexingQueued !== undefined ? responseData.indexingQueued : 1,
  indexingAttempts: responseData.indexingAttempts !== undefined ? responseData.indexingAttempts : 1,
  indexingFailures: responseData.indexingFailures || 0,
  indexingState: responseData.indexingState || 'queued',
  warningCodes: Array.isArray(responseData.warningCodes) ? responseData.warningCodes : [],
  warnings: Array.isArray(responseData.warnings) ? responseData.warnings : []
});

const getSessionTone = (session) => {
  if (!session) return '';
  if (session.status === 'failed') return 'error';
  if (session.status === 'completed_with_warnings') return 'warning';
  if (session.status === 'completed') return 'success';
  return 'info';
};

const getSessionMessage = (session) => {
  if (!session) return '';
  const provider = session.provider ? session.provider[0].toUpperCase() + session.provider.slice(1) : 'Import';
  if (session.status === 'failed') return `${provider} import failed. Your saved text is preserved where possible.`;
  if (session.status === 'completed_with_warnings') return `${provider} import finished with warnings. Imported text is available, but some semantic indexing work still needs follow-up.`;
  if (session.status === 'completed') return `${provider} import complete. Imported text is saved and queued for downstream retrieval.`;
  if (session.status === 'importing') return `${provider} import in progress.`;
  return '';
};

const getPreviewForSource = (session, sourceKey) => {
  if (!session || session.provider !== sourceKey) return null;
  const preview = session.preview && typeof session.preview === 'object' ? session.preview : null;
  if (!preview) return null;
  const hasCounts = ['items', 'articles', 'highlights', 'notes', 'pages', 'databases', 'notebooks']
    .some((key) => Number(preview[key] || 0) > 0);
  const hasSamples = ['sampleTitles', 'sampleAuthors', 'sampleTags', 'sampleDatabases']
    .some((key) => Array.isArray(preview[key]) && preview[key].length > 0);
  if (!hasCounts && !hasSamples) return null;
  return preview;
};

const stripFileExtension = (value = '') => String(value || '').replace(/\.[^./\\]+$/, '').trim();

const getReceiptDestination = ({ sourceKey, session, importStats, sourceLabel = '' }) => {
  if (!importStats) return null;

  if (sourceKey === 'evernote' && importStats.importedNotes > 0) {
    const label = stripFileExtension(sourceLabel || session?.sourceLabel || 'Evernote ENEX') || 'Evernote import';
    return {
      heading: 'Import receipt',
      body: `Imported Evernote notes were saved into Think under the mirrored "${label}" folder. Open the first imported note or create a concept next.`,
      primaryLabel: importStats.entryId ? 'Open first imported note' : 'Open Think',
      primaryPath: importStats.entryId
        ? `/think?tab=notebook&entryId=${encodeURIComponent(importStats.entryId)}`
        : '/think?tab=notebook',
      secondaryLabel: 'Open Think review',
      secondaryPath: '/think?tab=notebook'
    };
  }

  if (sourceKey === 'readwise' && (importStats.importedArticles > 0 || importStats.importedHighlights > 0)) {
    return {
      heading: 'Import receipt',
      body: `Readwise sync landed ${importStats.importedHighlights || 0} highlights across ${importStats.importedArticles || 0} articles. Open Think to review what came in and turn it into a concept.`,
      primaryLabel: 'Open Think review',
      primaryPath: '/think?tab=notebook',
      secondaryLabel: 'Open Today',
      secondaryPath: '/today'
    };
  }

  return null;
};

const toValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatLoopDate = (value) => {
  const date = toValidDate(value);
  if (!date) return 'Never';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const getConnectionLoopDate = (connection = null) => (
  connection?.lastSyncAt
    || connection?.lastPreviewAt
    || connection?.lastValidatedAt
    || connection?.updatedAt
    || connection?.createdAt
    || ''
);

const getSessionLoopDate = (session = null) => (
  session?.updatedAt
    || session?.completedAt
    || session?.createdAt
    || ''
);

const getProviderLabel = (provider = '') => {
  if (provider === 'readwise') return 'Readwise';
  if (provider === 'notion') return 'Notion';
  if (provider === 'evernote') return 'Evernote';
  if (provider === 'files') return 'Files and text';
  return 'Manual import';
};

const describeNotionConnectionState = (connection = null) => {
  if (!connection?.id) {
    return {
      status: 'Not connected',
      tone: 'neutral',
      headline: 'Connect opens Notion in your browser.',
      detail: 'After approval, Noeis returns here with the workspace connected. Then preview or sync the pages you shared with the integration.',
      cta: 'Connect Notion'
    };
  }

  if (connection.lastSyncAt) {
    const imported = Number(connection.lastSyncResult?.importedNotes || 0);
    const pageSuffix = imported > 0 ? ` · ${imported} page${imported === 1 ? '' : 's'}` : '';
    return {
      status: 'Synced into Noeis',
      tone: 'success',
      headline: `Last synced ${formatLoopDate(connection.lastSyncAt)}${pageSuffix}.`,
      detail: 'Imported pages are available as notebook entries and source material for Library search, Think retrieval, and Morning Paper maintenance.',
      cta: 'Sync again'
    };
  }

  if (connection.lastPreviewAt) {
    return {
      status: 'Scope previewed',
      tone: 'warning',
      headline: `Previewed ${formatLoopDate(connection.lastPreviewAt)}.`,
      detail: 'No pages have been imported yet. Run Sync from Notion to make the previewed workspace material retrievable in Noeis.',
      cta: 'Sync from Notion'
    };
  }

  if (connection.lastValidatedAt || connection.status === 'connected') {
    return {
      status: 'Connected, not synced',
      tone: 'warning',
      headline: connection.lastValidatedAt
        ? `Connection checked ${formatLoopDate(connection.lastValidatedAt)}.`
        : 'OAuth is connected.',
      detail: 'Share the pages or databases you want Noeis to read with the integration, then run Preview scope or Sync from Notion.',
      cta: 'Preview or sync'
    };
  }

  return {
    status: connection.status || 'Needs attention',
    tone: 'warning',
    headline: 'Reconnect Notion if this looks stale.',
    detail: connection.lastError || 'No successful validation, preview, or sync has been recorded yet.',
    cta: 'Reconnect Notion'
  };
};

const describeNotionSyncResult = ({ stats = null, session = null, connection = null } = {}) => {
  const durable = connection?.lastSyncResult;
  const result = durable || stats || (session?.provider === 'notion' ? session?.result : null);
  if (!result) return '';
  const imported = Number(result.importedNotes || result.notes || 0);
  const skipped = Number(result.skippedRows || result.skipped || 0);
  const indexingQueued = Number(result.indexingQueued || 0);
  const indexingFailures = Number(result.indexingFailures || 0);
  const pieces = [];
  pieces.push(`Synced ${imported} page${imported === 1 ? '' : 's'}`);
  if (skipped > 0) pieces.push(`${skipped} skipped`);
  if (indexingQueued > 0) pieces.push(`${indexingQueued} indexing`);
  if (indexingFailures > 0) pieces.push(`${indexingFailures} indexing warning${indexingFailures === 1 ? '' : 's'}`);
  return `${pieces.join(' · ')}.`;
};

const describeLoopHandoff = ({ readwiseConnection, notionConnection, session }) => {
  const candidates = [
    readwiseConnection?.id
      ? {
          label: 'Readwise',
          date: toValidDate(getConnectionLoopDate(readwiseConnection)),
          kind: readwiseConnection.lastSyncAt ? 'sync' : 'connection check'
        }
      : null,
    notionConnection?.id
      ? {
          label: 'Notion',
          date: toValidDate(getConnectionLoopDate(notionConnection)),
          kind: notionConnection.lastSyncAt ? 'sync' : 'connection check'
        }
      : null,
    session?.id
      ? {
          label: getProviderLabel(session.provider),
          date: toValidDate(getSessionLoopDate(session)),
          kind: ['completed', 'completed_with_warnings'].includes(session.status) ? 'import' : 'session'
        }
      : null
  ].filter((candidate) => candidate?.date);

  if (!candidates.length) return 'No source handoff recorded yet.';
  candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
  const latest = candidates[0];
  return `Latest handoff: ${latest.label} ${latest.kind} on ${formatLoopDate(latest.date)}.`;
};

const hasPendingOrganizeImportSuggestion = (session = null) => (
  Array.isArray(session?.agentSuggestions)
    && session.agentSuggestions.some((suggestion) => (
      String(suggestion?.type || '').trim().toLowerCase() === 'organize_import'
      && String(suggestion?.status || '').trim().toLowerCase() === 'pending'
    ))
);

const getActivationProvider = (state, session) => {
  const raw = `${session?.provider || ''} ${state?.sourceType || ''}`.toLowerCase();
  if (raw.includes('readwise')) return 'readwise';
  if (raw.includes('notion')) return 'notion';
  if (raw.includes('evernote')) return 'evernote';
  return 'files';
};

const getSeedSamplesForProvider = (provider, preview = {}) => {
  if (!preview || typeof preview !== 'object') return [];
  const candidates = provider === 'readwise'
    ? [...(preview.sampleTags || []), ...(preview.sampleTitles || []), ...(preview.sampleAuthors || [])]
    : provider === 'notion'
      ? [...(preview.sampleDatabases || []), ...(preview.sampleTitles || [])]
      : [...(preview.sampleTitles || []), ...(preview.sampleTags || [])];
  return candidates
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, list) => list.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, 3);
};

const getActivationCopy = ({ state, session, scheduleTarget }) => {
  const provider = getActivationProvider(state, session);
  const preview = session?.preview && typeof session.preview === 'object' ? session.preview : {};
  const seeds = getSeedSamplesForProvider(provider, preview);

  if (provider === 'readwise') {
    return {
      heading: 'Activate your Readwise import',
      intro: 'You brought in highlights from your reading layer. Turn one repeated theme, book, or tag into a concept instead of leaving it in archive mode.',
      progressLabel: 'Imported now',
      recommendationLabel: 'Recommended next step',
      recommendationText: seeds.length
        ? `Start with one concept that cuts across ${seeds.join(' · ')}.`
        : 'Start with one concept that cuts across the books, tags, or highlights you just imported.',
      conceptLabel: 'Create a concept from books, tags, or highlights',
      conceptPlaceholder: seeds[0] ? `e.g. ${seeds[0]}` : 'e.g. Deep work and attention',
      closeLoopLabel: 'Keep the reading layer active',
      closeLoopText: scheduleTarget
        ? `Schedule this ${scheduleTarget.label} back into your queue so the imported highlights resurface in context.`
        : 'Create a concept or open one imported item first, then schedule a revisit.',
      seedLine: seeds.length ? `Suggested seeds: ${seeds.join(' · ')}` : ''
    };
  }

  if (provider === 'notion') {
    return {
      heading: 'Activate your Notion import',
      intro: 'You brought in pages and database rows. Pick one workspace thread, operating principle, or project cluster and turn it into a reusable concept.',
      progressLabel: 'Imported now',
      recommendationLabel: 'Recommended next step',
      recommendationText: seeds.length
        ? `Start with one concept that organizes ${seeds.join(' · ')} into a clearer idea.`
        : 'Start with one concept that organizes the pages or databases you just imported into a clearer idea.',
      conceptLabel: 'Create a concept from pages or database content',
      conceptPlaceholder: seeds[0] ? `e.g. ${seeds[0]}` : 'e.g. Product operating system',
      closeLoopLabel: 'Keep the workspace alive',
      closeLoopText: scheduleTarget
        ? `Schedule this ${scheduleTarget.label} back into your queue so imported pages become material you revisit instead of static docs.`
        : 'Create a concept or open one imported note first, then schedule a revisit.',
      seedLine: seeds.length ? `Suggested seeds: ${seeds.join(' · ')}` : ''
    };
  }

  if (provider === 'evernote') {
    return {
      heading: 'Activate your Evernote import',
      intro: 'You brought in notebook material. Pick one recurring topic or note cluster and promote it into a concept you can keep developing.',
      progressLabel: 'Imported now',
      recommendationLabel: 'Recommended next step',
      recommendationText: seeds.length
        ? `Start with one concept that ties together ${seeds.join(' · ')}.`
        : 'Start with one concept that ties together the notes you just imported.',
      conceptLabel: 'Create a concept from imported notes',
      conceptPlaceholder: seeds[0] ? `e.g. ${seeds[0]}` : 'e.g. Research operating notes',
      closeLoopLabel: 'Keep notebook material resurfacing',
      closeLoopText: scheduleTarget
        ? `Schedule this ${scheduleTarget.label} back into your queue so imported notes reappear as working material.`
        : 'Create a concept or open one imported note first, then schedule a revisit.',
      seedLine: seeds.length ? `Suggested seeds: ${seeds.join(' · ')}` : ''
    };
  }

  return {
    heading: 'Activate this capture',
    intro: 'Don’t stop at import. Turn this capture into something you can continue and revisit.',
    progressLabel: 'In progress',
    recommendationLabel: 'Recommended next step',
    recommendationText: 'Create or pick a concept so this note becomes part of a working thread instead of a one-off entry.',
    conceptLabel: 'Create or pick a concept',
    conceptPlaceholder: 'e.g. Retrieval systems',
    closeLoopLabel: 'Close the loop',
    closeLoopText: scheduleTarget
      ? `Schedule this ${scheduleTarget.label} back into your queue so it resurfaces automatically.`
      : 'Create a note or concept first, then schedule a revisit.',
    seedLine: ''
  };
};

const DataIntegrations = ({ embedded = false } = {}) => {
  const navigate = useNavigate();
  const bridgeModel = useAgentBridge();
  const personalAgentsModel = usePersonalAgents();
  const [selectedSource, setSelectedSource] = useState('readwise');
  const [importStatus, setImportStatus] = useState({ tone: '', message: '' });
  const [importStats, setImportStats] = useState(null);
  const [lastImportSourceLabel, setLastImportSourceLabel] = useState('');
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [organizeLaunching, setOrganizeLaunching] = useState(false);
  const [importing, setImporting] = useState({ csv: false, md: false, enex: false, manual: false, paste: false });
  const [previewing, setPreviewing] = useState({ readwise: false, notion: false, evernote: false });
  const [readwiseToken, setReadwiseToken] = useState('');
  const [readwiseLabel, setReadwiseLabel] = useState('Readwise');
  const [readwiseConnection, setReadwiseConnection] = useState(null);
  const [readwiseConnections, setReadwiseConnections] = useState([]);
  const [readwiseConnecting, setReadwiseConnecting] = useState(false);
  const [readwiseMcpConnecting, setReadwiseMcpConnecting] = useState(false);
  const [readwiseChecking, setReadwiseChecking] = useState(false);
  const [readwiseSyncing, setReadwiseSyncing] = useState(false);
  const [notionConnection, setNotionConnection] = useState(null);
  const [notionSetupMissingEnv, setNotionSetupMissingEnv] = useState([]);
  const [notionChecking, setNotionChecking] = useState(false);
  const [notionConnecting, setNotionConnecting] = useState(false);
  const [notionSyncing, setNotionSyncing] = useState(false);
  const [notionExporting, setNotionExporting] = useState(false);
  const [notionExportResult, setNotionExportResult] = useState(null);
  const [notionAgentFetching, setNotionAgentFetching] = useState(false);
  const [notionAgentResult, setNotionAgentResult] = useState(null);
  const [evernoteFile, setEvernoteFile] = useState(null);
  const [evernoteDragActive, setEvernoteDragActive] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualText, setManualText] = useState('');
  const [manualTags, setManualTags] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [pasteMode, setPasteMode] = useState('auto');
  const [activationState, setActivationState] = useState(() => readFirstInsightState());
  const [conceptName, setConceptName] = useState(() => readFirstInsightState()?.conceptName || '');
  const [conceptError, setConceptError] = useState('');
  const [conceptBusy, setConceptBusy] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const csvInputRef = useRef(null);
  const mdInputRef = useRef(null);
  const enexInputRef = useRef(null);
  const [showAdvancedBridgeSetup, setShowAdvancedBridgeSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadActiveSession = async () => {
      setSessionLoading(true);
      try {
        const session = await getActiveImportSession();
        if (cancelled) return;
        setCurrentSession(session);
        if (session?.provider && SOURCE_OPTIONS.some(option => option.key === session.provider)) {
          setSelectedSource(session.provider);
        }
      } catch (error) {
        console.error('Failed to load active import session:', error);
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    };
    loadActiveSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currentSession?.status !== 'importing') {
      return undefined;
    }

    let cancelled = false;
    const refreshImportSession = async () => {
      try {
        const session = await getActiveImportSession();
        if (cancelled) return;
        setCurrentSession(session);
        if (session?.provider && SOURCE_OPTIONS.some(option => option.key === session.provider)) {
          setSelectedSource(session.provider);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to refresh active import session:', error);
        }
      }
    };

    const intervalId = window.setInterval(refreshImportSession, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentSession?.status]);

  useEffect(() => {
    let cancelled = false;
    const loadReadwiseConnection = async () => {
      try {
        const connections = await listImportConnections({ provider: 'readwise' });
        if (cancelled) return;
        const latest = connections[0] || null;
        setReadwiseConnections(Array.isArray(connections) ? connections : []);
        setReadwiseConnection(latest);
        if (latest?.accountLabel) {
          setReadwiseLabel(latest.accountLabel);
        }
      } catch (error) {
        console.error('Failed to load Readwise connection:', error);
      }
    };
    loadReadwiseConnection();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadNotionConnection = async () => {
      try {
        const connections = await listImportConnections({ provider: 'notion' });
        if (cancelled) return;
        setNotionConnection(connections[0] || null);
      } catch (error) {
        console.error('Failed to load Notion connection:', error);
      }
    };
    loadNotionConnection();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');
    const hashSource = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
    const notionState = params.get('notion');
    const readwiseState = params.get('readwise');
    if (source === 'notion') {
      setSelectedSource('notion');
      if (notionState === 'connected') {
        setStatus('Notion connected. You can sync pages and databases now.', 'success');
      } else if (notionState === 'error') {
        setStatus('Notion OAuth failed. Try again.', 'error');
      }
      params.delete('source');
      params.delete('notion');
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', next);
    } else if (source === 'readwise') {
      setSelectedSource('readwise');
      if (readwiseState === 'connected') {
        void (async () => {
          try {
            const connections = await listImportConnections({ provider: 'readwise' });
            const latest = connections[0] || null;
            setReadwiseConnection(latest);
            if (latest?.accountLabel) {
              setReadwiseLabel(latest.accountLabel);
            }
            let previewHighlights;
            let previewItems;
            if (latest?.id) {
              try {
                const preview = await previewReadwiseConnection({ connectionId: latest.id });
                previewHighlights = preview?.preview?.highlights ?? preview?.highlights;
                previewItems = preview?.preview?.items ?? preview?.items;
              } catch (_previewError) {
                previewHighlights = undefined;
                previewItems = undefined;
              }
            }
            const [concepts, highlightsResult] = await Promise.all([
              getConcepts().catch(() => []),
              getAllHighlights().catch(() => [])
            ]);
            setStatus(composeReadwiseConnectMoment({
              highlightCount: Array.isArray(highlightsResult) ? highlightsResult.length : 0,
              activeConceptCount: countActiveConcepts(concepts),
              previewHighlights,
              previewItems
            }), 'success');
          } catch (_error) {
            setStatus(composeReadwiseConnectMoment({}), 'success');
          }
        })();
      } else if (readwiseState === 'error') {
        setStatus('Readwise browser authorization failed. Try again.', 'error');
      }
      params.delete('source');
      params.delete('readwise');
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', next);
    } else if (['readwise', 'notion', 'evernote'].includes(hashSource)) {
      setSelectedSource(hashSource);
    }
  }, []);

  useEffect(() => {
    const hashSource = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
    if (!['readwise', 'notion', 'evernote'].includes(hashSource) || hashSource !== selectedSource) return;
    window.requestAnimationFrame?.(() => {
      const target = document.getElementById(hashSource);
      if (target?.scrollIntoView) {
        target.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
    });
  }, [selectedSource]);

  const setStatus = (message, tone = 'info') => {
    setImportStatus({ message, tone });
  };

  const handleOrganizeImport = async () => {
    const safeSessionId = String(currentSession?.id || currentSession?._id || '').trim();
    if (!safeSessionId || organizeLaunching) return;

    setOrganizeLaunching(true);
    setStatus('Starting an organization review thread…');
    try {
      const result = await chatWithAgent({
        message: 'Organize this import for me and stage a reviewable cleanup plan.',
        persistThread: true,
        threadTitle: `${String(currentSession?.provider || 'Import').trim() || 'Import'} cleanup`,
        context: {
          type: 'import_session',
          id: safeSessionId,
          title: `${String(currentSession?.provider || 'Import').trim() || 'Import'} import`
        }
      });
      const nextThreadId = String(result?.thread?.threadId || '').trim();
      setStatus('Organization review thread is ready.', 'success');
      navigate(nextThreadId
        ? `/think?tab=threads&threadId=${encodeURIComponent(nextThreadId)}`
        : '/think?tab=threads');
    } catch (error) {
      setStatus(error.response?.data?.error || 'Failed to start the organization review thread.', 'error');
    } finally {
      setOrganizeLaunching(false);
    }
  };

  const createSessionForImport = async ({ provider, mode, sourceLabel, sourceType }) => {
    const session = await createImportSession({
      provider,
      mode,
      sourceLabel,
      status: 'draft',
      config: {
        sourceType,
        importStrategy: mode
      },
      progress: {
        stage: 'draft',
        percent: 0,
        indexingState: 'not_started'
      },
      activation: {
        primaryAction: 'create_concept'
      }
    });
    setCurrentSession(session);
    return session;
  };

  const patchSession = async (sessionId, payload) => {
    if (!sessionId) return null;
    const session = await updateImportSession(sessionId, payload);
    if (!session) return null;
    let nextSession = null;
    setCurrentSession((previous) => {
      nextSession = {
        ...(previous || {}),
        ...session,
        preview: session.preview || previous?.preview || {},
        progress: session.progress || previous?.progress || {},
        result: session.result || previous?.result || {},
        activation: session.activation || previous?.activation || {}
      };
      return nextSession;
    });
    return nextSession;
  };

  const ensureSessionForSource = async ({ provider, mode, sourceLabel, sourceType }) => {
    if (
      currentSession?.id
      && currentSession.provider === provider
      && ['draft', 'preview_ready'].includes(currentSession.status)
      && (!sourceLabel || currentSession.sourceLabel === sourceLabel)
    ) {
      return currentSession;
    }
    return createSessionForImport({
      provider,
      mode,
      sourceLabel,
      sourceType
    });
  };

  const createNotebookFromText = async ({
    title,
    text,
    tags = [],
    sourceType = 'manual-note',
    provider = 'manual',
    importSessionId = ''
  }) => {
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      throw new Error('Text is required.');
    }
    const blocks = buildBlocksFromText(cleanText);
    const content = buildHtmlFromText(cleanText);
    if (!content || blocks.length === 0) {
      throw new Error('Could not parse text into notebook content.');
    }
    const response = await api.post('/api/notebook', {
      title: String(title || '').trim() || 'Untitled',
      content,
      blocks,
      tags,
      source: sourceType,
      importMeta: {
        provider,
        sourceType,
        sourceLabel: String(title || '').trim() || 'Untitled',
        importSessionId: importSessionId || null,
        importedAt: new Date().toISOString()
      }
    }, getAuthConfig());
    return response.data;
  };

  const rememberFirstInsight = ({
    sourceType,
    title,
    notebookEntryId = '',
    articleId = '',
    counts = {}
  }) => {
    const next = saveFirstInsightState({
      status: 'captured',
      sourceType,
      title: String(title || '').trim() || 'Untitled',
      notebookEntryId,
      articleId,
      counts
    });
    setActivationState(next);
    setConceptName(next.conceptName || '');
    setConceptError('');
    setScheduleError('');
    trackActivationMilestone({
      milestone: 'first_insight_captured',
      sourceType,
      title: next.title,
      importedArticles: next.counts.importedArticles,
      importedHighlights: next.counts.importedHighlights,
      importedNotes: next.counts.importedNotes
    });
    return next;
  };

  const selectEvernoteFile = (file) => {
    if (!file) return;
    setEvernoteFile(file);
    setStatus(`Selected ${file.name}. Preview or import when ready.`, 'info');
  };

  const getSchedulableTarget = (stateOverride = activationState) => {
    const current = stateOverride;
    if (!current) return null;
    if (current.conceptId) {
      return {
        itemType: 'concept',
        itemId: current.conceptId,
        label: 'concept'
      };
    }
    if (current.notebookEntryId) {
      return {
        itemType: 'notebook',
        itemId: current.notebookEntryId,
        label: 'note'
      };
    }
    if (current.articleId) {
      return {
        itemType: 'article',
        itemId: current.articleId,
        label: 'article'
      };
    }
    return null;
  };

  const importCsvFile = async (file, importSessionId = '') => {
    const formData = new FormData();
    formData.append('file', file);
    if (importSessionId) formData.append('importSessionId', importSessionId);
    const response = await api.post('/api/import/readwise-csv', formData, getAuthConfig());
    return response.data;
  };

  const importMarkdownFile = async (file, importSessionId = '') => {
    const formData = new FormData();
    formData.append('file', file);
    if (importSessionId) formData.append('importSessionId', importSessionId);
    const response = await api.post('/api/import/markdown', formData, getAuthConfig());
    return response.data;
  };

  const importEvernoteFile = async (file, importSessionId = '') => {
    const formData = new FormData();
    formData.append('file', file);
    if (importSessionId) formData.append('importSessionId', importSessionId);
    const response = await api.post('/api/import/evernote-enex', formData, getAuthConfig());
    return response.data;
  };

  const previewEvernoteFile = async (file, importSessionId = '') => {
    const formData = new FormData();
    formData.append('file', file);
    if (importSessionId) formData.append('importSessionId', importSessionId);
    const response = await api.post('/api/import/evernote-enex/preview', formData, getAuthConfig());
    return response.data || {};
  };

  const handleReadwiseImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting((previous) => ({ ...previous, csv: true }));
    setStatus('Importing Readwise CSV...');
    setImportStats(null);
    try {
      const session = await createSessionForImport({
        provider: 'readwise',
        mode: 'file_upload',
        sourceLabel: file.name || 'Readwise CSV',
        sourceType: 'csv'
      });
      const data = await importCsvFile(file, session?.id);
      const summary = makeSummaryFromCsvResponse(data);
      setImportStats(summary);
      setLastImportSourceLabel(file.name || 'Readwise CSV');
      rememberFirstInsight({
        sourceType: 'readwise-csv',
        title: file.name || 'Readwise import',
        articleId: summary.articleIds[0] || '',
        counts: summary
      });
      setStatus(summary.indexingFailures > 0 ? 'Readwise import complete with indexing warnings.' : 'Readwise import complete.', summary.indexingFailures > 0 ? 'warning' : 'success');
      if (session?.id) {
        await patchSession(session.id, {
          activation: {
            status: 'captured',
            primaryAction: 'create_concept'
          }
        });
      }
    } catch (error) {
      console.error('Readwise import failed:', error);
      setStatus(error.response?.data?.error || 'Failed to import Readwise CSV.', 'error');
    } finally {
      setImporting((previous) => ({ ...previous, csv: false }));
      event.target.value = '';
    }
  };

  const handleReadwiseConnect = async () => {
    const apiToken = String(readwiseToken || '').trim();
    if (!apiToken) {
      setStatus('Paste your Readwise API token first.', 'error');
      return;
    }
    setReadwiseConnecting(true);
    setStatus('Validating Readwise token...');
    try {
      const connection = await connectReadwiseToken({
        apiToken,
        accountLabel: readwiseLabel
      });
      setReadwiseConnection(connection);
      setReadwiseConnections((previous) => [
        connection,
        ...previous.filter((item) => item?.id !== connection?.id)
      ]);
      setReadwiseToken('');
      setStatus('Readwise connected. You can sync directly now.', 'success');
    } catch (error) {
      console.error('Readwise connect failed:', error);
      setStatus(error.response?.data?.error || 'Failed to validate Readwise token.', 'error');
    } finally {
      setReadwiseConnecting(false);
    }
  };

  const handleReadwiseBrowserConnect = async () => {
    setReadwiseMcpConnecting(true);
    setStatus('Opening Readwise sign-in...');
    try {
      const authUrl = await startReadwiseOAuth();
      if (!authUrl) {
        throw new Error('Missing Readwise authorization URL.');
      }
      window.open(authUrl, '_self', 'noopener,noreferrer');
    } catch (error) {
      console.error('Failed to start Readwise OAuth:', error);
      setStatus(error.response?.data?.error || error.message || 'Failed to start Readwise browser authorization.', 'error');
      setReadwiseMcpConnecting(false);
    }
  };

  const handleReadwisePreview = async () => {
    if (!readwiseSyncConnection?.id) {
      setStatus(readwiseAgentConnection?.id
        ? 'Readwise browser access is connected for agents. Direct preview still needs the advanced API-token connection.'
        : 'Connect Readwise first.', 'error');
      return;
    }
    setPreviewing((previous) => ({ ...previous, readwise: true }));
    setImportStats(null);
    setStatus('Previewing Readwise content...');
    try {
      const session = await ensureSessionForSource({
        provider: 'readwise',
        mode: 'api_token',
        sourceLabel: readwiseSyncConnection.accountLabel || 'Readwise',
        sourceType: 'api'
      });
      const data = await previewReadwiseConnection({
        connectionId: readwiseSyncConnection.id,
        importSessionId: session?.id
      });
      if (data?.session) {
        setCurrentSession(data.session);
      }
      if (data?.connection) {
        setReadwiseConnection(data.connection);
        setReadwiseConnections((previous) => [
          data.connection,
          ...previous.filter((item) => item?.id !== data.connection?.id)
        ]);
      }
      setStatus('Readwise preview ready. Review the sample before syncing.', 'success');
    } catch (error) {
      console.error('Readwise preview failed:', error);
      setStatus(error.response?.data?.error || 'Failed to preview Readwise content.', 'error');
    } finally {
      setPreviewing((previous) => ({ ...previous, readwise: false }));
    }
  };

  const handleReadwiseCheck = async () => {
    const connectionToCheck = readwiseSyncConnection || readwiseAgentConnection || readwiseConnection;
    if (!connectionToCheck?.id) {
      setStatus('Connect Readwise first.', 'error');
      return;
    }
    setReadwiseChecking(true);
    setStatus('Checking Readwise connection...');
    try {
      const data = await checkReadwiseConnection({
        connectionId: connectionToCheck.id
      });
      if (data?.connection) {
        setReadwiseConnection(data.connection);
        setReadwiseConnections((previous) => [
          data.connection,
          ...previous.filter((item) => item?.id !== data.connection?.id)
        ]);
      }
      setStatus('Readwise connection is healthy.', 'success');
    } catch (error) {
      console.error('Readwise connection check failed:', error);
      if (error.response?.data?.connection) {
        setReadwiseConnection(error.response.data.connection);
        setReadwiseConnections((previous) => [
          error.response.data.connection,
          ...previous.filter((item) => item?.id !== error.response.data.connection?.id)
        ]);
      }
      setStatus(error.response?.data?.error || 'Failed to check Readwise connection.', 'error');
    } finally {
      setReadwiseChecking(false);
    }
  };

  const handleReadwiseSync = async () => {
    if (!readwiseSyncConnection?.id) {
      setStatus(readwiseAgentConnection?.id
        ? 'Readwise browser access is connected for agents. Direct import still needs the advanced API-token connection.'
        : 'Connect Readwise first.', 'error');
      return;
    }
    let session = null;
    setReadwiseSyncing(true);
    setImportStats(null);
    setStatus('Syncing from Readwise...');
    try {
      session = await ensureSessionForSource({
        provider: 'readwise',
        mode: 'api_token',
        sourceLabel: readwiseSyncConnection.accountLabel || 'Readwise',
        sourceType: 'api'
      });
      if (session?.id) {
        setCurrentSession({
          ...session,
          status: 'importing',
          sourceLabel: readwiseSyncConnection.accountLabel || session.sourceLabel || 'Readwise',
          progress: {
            ...(session.progress || {}),
            stage: 'fetching_readwise',
            percent: Math.max(session.progress?.percent || 0, 5),
            indexingState: 'not_started'
          }
        });
      }
      const data = await syncReadwiseConnection({
        connectionId: readwiseSyncConnection.id,
        importSessionId: session?.id
      });
      const summary = makeSummaryFromCsvResponse(data);
      setImportStats(summary);
      setLastImportSourceLabel(readwiseSyncConnection.accountLabel || 'Readwise');
      if (data?.connection) {
        setReadwiseConnection(data.connection);
        setReadwiseConnections((previous) => [
          data.connection,
          ...previous.filter((item) => item?.id !== data.connection?.id)
        ]);
      }
      if ((summary.importedArticles || 0) > 0 || (summary.importedHighlights || 0) > 0) {
        rememberFirstInsight({
          sourceType: 'readwise-api',
          title: readwiseSyncConnection.accountLabel || 'Readwise sync',
          articleId: summary.articleIds[0] || '',
          counts: summary
        });
        if (session?.id) {
          await patchSession(session.id, {
            activation: {
              status: 'captured',
              primaryAction: 'create_concept'
            }
          });
        }
      }
      if ((summary.importedArticles || 0) === 0 && (summary.importedHighlights || 0) === 0) {
        setStatus('Readwise sync completed. No new items were imported.', 'success');
      } else {
        setStatus(summary.indexingFailures > 0 ? 'Readwise sync complete with indexing warnings.' : 'Readwise sync complete.', summary.indexingFailures > 0 ? 'warning' : 'success');
      }
    } catch (error) {
      console.error('Readwise sync failed:', error);
      if (session?.id) {
        setCurrentSession((previous) => {
          if (!previous || previous.id !== session.id) return previous;
          return {
            ...previous,
            status: 'failed',
            progress: {
              ...(previous.progress || {}),
              stage: 'failed'
            }
          };
        });
      }
      setStatus(error.response?.data?.error || 'Failed to sync from Readwise.', 'error');
    } finally {
      setReadwiseSyncing(false);
    }
  };

  const handleNotionConnect = async () => {
    setNotionConnecting(true);
    try {
      const authUrl = await startNotionOAuth();
      if (!authUrl) {
        throw new Error('Missing Notion authorization URL.');
      }
      setNotionSetupMissingEnv([]);
      window.location.href = authUrl;
    } catch (error) {
      console.error('Failed to start Notion OAuth:', error);
      setNotionSetupMissingEnv(
        Array.isArray(error.response?.data?.missingEnv)
          ? error.response.data.missingEnv
          : []
      );
      setStatus(error.response?.data?.error || error.message || 'Failed to start Notion OAuth.', 'error');
      setNotionConnecting(false);
    }
  };

  const handleNotionPreview = async () => {
    if (!notionConnection?.id) {
      setStatus('Connect Notion first.', 'error');
      return;
    }
    setPreviewing((previous) => ({ ...previous, notion: true }));
    setImportStats(null);
    setStatus('Previewing Notion content...');
    try {
      const session = await ensureSessionForSource({
        provider: 'notion',
        mode: 'oauth',
        sourceLabel: notionConnection.accountLabel || 'Notion',
        sourceType: 'oauth'
      });
      const data = await previewNotionConnection({
        connectionId: notionConnection.id,
        importSessionId: session?.id
      });
      if (data?.session) {
        setCurrentSession(data.session);
      }
      if (data?.connection) {
        setNotionConnection(data.connection);
      }
      setStatus('Notion preview ready. Review the sample before syncing.', 'success');
    } catch (error) {
      console.error('Notion preview failed:', error);
      setStatus(error.response?.data?.error || 'Failed to preview Notion content.', 'error');
    } finally {
      setPreviewing((previous) => ({ ...previous, notion: false }));
    }
  };

  const handleNotionCheck = async () => {
    if (!notionConnection?.id) {
      setStatus('Connect Notion first.', 'error');
      return;
    }
    setNotionChecking(true);
    setStatus('Checking Notion connection...');
    try {
      const data = await checkNotionConnection({
        connectionId: notionConnection.id
      });
      if (data?.connection) {
        setNotionConnection(data.connection);
      }
      setStatus('Notion connection is healthy.', 'success');
    } catch (error) {
      console.error('Notion connection check failed:', error);
      if (error.response?.data?.connection) {
        setNotionConnection(error.response.data.connection);
      }
      setStatus(error.response?.data?.error || 'Failed to check Notion connection.', 'error');
    } finally {
      setNotionChecking(false);
    }
  };

  // Agent-mediated Notion fetch — uses the agent's skip-if-unchanged path.
  // Different from handleNotionSync (manual import) in two ways:
  //  1. Doesn't open a preview / picker; fetches up to N pages directly.
  //  2. Skips pages whose Notion last_edited_time matches the cached value,
  //     so re-running this is cheap.
  // Same backing connection as the manual sync.
  const handleNotionAgentFetch = async () => {
    if (!notionConnection?.id) {
      setStatus('Connect Notion first.', 'error');
      return;
    }
    setNotionAgentFetching(true);
    setNotionAgentResult(null);
    setStatus(`Asking ${AGENT_DISPLAY_NAME} to fetch your Notion pages…`);
    try {
      const result = await fetchNotionPagesViaAgent({ connectionId: notionConnection.id });
      setNotionAgentResult(result);
      setStatus(result?.summary || `${AGENT_DISPLAY_NAME} finished fetching from Notion.`, result?.failed ? 'warning' : 'success');
    } catch (error) {
      console.error('Agent Notion fetch failed:', error);
      const message = error?.response?.data?.summary
        || error?.response?.data?.error
        || error?.message
        || `${AGENT_DISPLAY_NAME} fetch failed.`;
      setStatus(message, 'error');
    } finally {
      setNotionAgentFetching(false);
    }
  };

  const handleNotionSync = async () => {
    if (!notionConnection?.id) {
      setStatus('Connect Notion first.', 'error');
      return;
    }
    let session = null;
    setNotionSyncing(true);
    setImportStats(null);
    setStatus('Syncing from Notion...');
    try {
      session = await ensureSessionForSource({
        provider: 'notion',
        mode: 'oauth',
        sourceLabel: notionConnection.accountLabel || 'Notion',
        sourceType: 'oauth'
      });
      if (session?.id) {
        setCurrentSession({
          ...session,
          status: 'importing',
          sourceLabel: notionConnection.accountLabel || session.sourceLabel || 'Notion',
          progress: {
            ...(session.progress || {}),
            stage: 'fetching_notion',
            percent: Math.max(session.progress?.percent || 0, 5),
            indexingState: 'not_started'
          }
        });
      }
      const data = await syncNotionConnection({
        connectionId: notionConnection.id,
        importSessionId: session?.id
      });
      const summary = makeSummaryFromNoteResponse(data);
      summary.skippedRows = data.skippedRows || 0;
      summary.duplicateSkips = data.duplicateSkips || 0;
      summary.invalidSkips = data.invalidSkips || 0;
      summary.warningCodes = Array.isArray(data.warningCodes) ? data.warningCodes : [];
      summary.warnings = Array.isArray(data.warnings) ? data.warnings : [];
      summary.indexingQueued = data.indexingQueued || 0;
      summary.indexingAttempts = data.indexingAttempts || 0;
      summary.indexingFailures = data.indexingFailures || 0;
      summary.indexingState = data.indexingState || 'not_started';
      setImportStats(summary);
      setLastImportSourceLabel(notionConnection.accountLabel || 'Notion');
      if (data?.connection) {
        setNotionConnection(data.connection);
      }
      if (summary.importedNotes > 0) {
        rememberFirstInsight({
          sourceType: 'notion-oauth',
          title: notionConnection.accountLabel || 'Notion sync',
          notebookEntryId: summary.entryId,
          counts: summary
        });
        if (session?.id) {
          await patchSession(session.id, {
            activation: {
              status: 'captured',
              primaryAction: 'create_concept'
            }
          });
        }
      }
      if (summary.importedNotes === 0) {
        setStatus('Notion sync completed. No new pages or database rows were imported.', 'success');
      } else {
        setStatus(summary.indexingFailures > 0 ? 'Notion sync complete with indexing warnings.' : 'Notion sync complete.', summary.indexingFailures > 0 ? 'warning' : 'success');
      }
    } catch (error) {
      console.error('Notion sync failed:', error);
      if (session?.id) {
        setCurrentSession((previous) => {
          if (!previous || previous.id !== session.id) return previous;
          return {
            ...previous,
            status: 'failed',
            progress: {
              ...(previous.progress || {}),
              stage: 'failed'
            }
          };
        });
      }
      setStatus(error.response?.data?.error || 'Failed to sync from Notion.', 'error');
    } finally {
      setNotionSyncing(false);
    }
  };

  const handleFileImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const uploadMode = detectUploadMode(file);
    if (!uploadMode) {
      setStatus('Upload a markdown or CSV file.', 'error');
      event.target.value = '';
      return;
    }
    setImporting((previous) => ({ ...previous, md: true }));
    setStatus(uploadMode === 'csv' ? 'Importing CSV file...' : 'Importing markdown note...');
    setImportStats(null);
    try {
      const session = await createSessionForImport({
        provider: uploadMode === 'csv' ? 'readwise' : 'files',
        mode: 'file_upload',
        sourceLabel: file.name || (uploadMode === 'csv' ? 'Readwise CSV' : 'Markdown note'),
        sourceType: uploadMode
      });
      if (uploadMode === 'csv') {
        const data = await importCsvFile(file, session?.id);
        const summary = makeSummaryFromCsvResponse(data);
        setImportStats(summary);
        rememberFirstInsight({
          sourceType: 'readwise-csv',
          title: file.name || 'Imported CSV',
          articleId: summary.articleIds[0] || '',
          counts: summary
        });
        setStatus(summary.indexingFailures > 0 ? 'CSV import complete with indexing warnings.' : 'CSV import complete.', summary.indexingFailures > 0 ? 'warning' : 'success');
      } else {
        const data = await importMarkdownFile(file, session?.id);
        const summary = makeSummaryFromNoteResponse(data);
        setImportStats(summary);
        rememberFirstInsight({
          sourceType: 'markdown',
          title: file.name || 'Imported markdown note',
          notebookEntryId: summary.entryId,
          counts: summary
        });
        setStatus(summary.indexingFailures > 0 ? 'Markdown import complete with indexing warnings.' : 'Markdown import complete.', summary.indexingFailures > 0 ? 'warning' : 'success');
      }
      if (session?.id) {
        await patchSession(session.id, {
          activation: {
            status: 'captured',
            primaryAction: 'create_concept'
          }
        });
      }
    } catch (error) {
      console.error('File import failed:', error);
      setStatus(error.response?.data?.error || 'Failed to import file.', 'error');
    } finally {
      setImporting((previous) => ({ ...previous, md: false }));
      event.target.value = '';
    }
  };

  const handleEvernoteFileSelected = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    selectEvernoteFile(file);
    event.target.value = '';
  };

  const handleEvernoteDragOver = (event) => {
    event.preventDefault();
    setEvernoteDragActive(true);
  };

  const handleEvernoteDragLeave = (event) => {
    event.preventDefault();
    setEvernoteDragActive(false);
  };

  const handleEvernoteDrop = (event) => {
    event.preventDefault();
    setEvernoteDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!String(file.name || '').toLowerCase().endsWith('.enex')) {
      setStatus('Drop an .enex export file from Evernote.', 'error');
      return;
    }
    selectEvernoteFile(file);
  };

  const handleEvernotePreview = async () => {
    const file = evernoteFile;
    if (!file) {
      setStatus('Choose an ENEX file first.', 'error');
      return;
    }
    setPreviewing((previous) => ({ ...previous, evernote: true }));
    setImportStats(null);
    setStatus('Previewing Evernote ENEX...');
    try {
      const session = await ensureSessionForSource({
        provider: 'evernote',
        mode: 'file_upload',
        sourceLabel: file.name || 'Evernote ENEX',
        sourceType: 'enex'
      });
      const data = await previewEvernoteFile(file, session?.id);
      if (data?.session) {
        setCurrentSession(data.session);
      }
      setStatus('Evernote preview ready. Review the sample before importing.', 'success');
    } catch (error) {
      console.error('Evernote preview failed:', error);
      setStatus(error.response?.data?.error || 'Failed to preview Evernote ENEX.', 'error');
    } finally {
      setPreviewing((previous) => ({ ...previous, evernote: false }));
    }
  };

  const handleEvernoteImport = async () => {
    const file = evernoteFile;
    if (!file) {
      setStatus('Choose an ENEX file first.', 'error');
      return;
    }
    setImporting((previous) => ({ ...previous, enex: true }));
    setStatus('Importing Evernote ENEX...');
    setImportStats(null);
    try {
      const session = await ensureSessionForSource({
        provider: 'evernote',
        mode: 'file_upload',
        sourceLabel: file.name || 'Evernote ENEX',
        sourceType: 'enex'
      });
      const data = await importEvernoteFile(file, session?.id);
      const summary = makeSummaryFromNoteResponse(data);
      summary.skippedRows = data.skippedRows || 0;
      summary.duplicateSkips = data.duplicateSkips || 0;
      summary.invalidSkips = data.invalidSkips || 0;
      summary.warningCodes = Array.isArray(data.warningCodes) ? data.warningCodes : [];
      summary.warnings = Array.isArray(data.warnings) ? data.warnings : [];
      summary.indexingQueued = data.indexingQueued || 0;
      summary.indexingAttempts = data.indexingAttempts || 0;
      summary.indexingFailures = data.indexingFailures || 0;
      summary.indexingState = data.indexingState || 'not_started';
      setImportStats(summary);
      setLastImportSourceLabel(file.name || 'Evernote ENEX');
      if (summary.importedNotes > 0) {
        rememberFirstInsight({
          sourceType: 'evernote-enex',
          title: file.name || 'Evernote import',
          notebookEntryId: summary.entryId,
          counts: summary
        });
        if (session?.id) {
          await patchSession(session.id, {
            activation: {
              status: 'captured',
              primaryAction: 'create_concept'
            }
          });
        }
      }
      if (summary.importedNotes === 0) {
        setStatus('Evernote import completed. No new notes were created.', 'success');
      } else {
        setStatus(summary.indexingFailures > 0 ? 'Evernote import complete with indexing warnings.' : 'Evernote import complete.', summary.indexingFailures > 0 ? 'warning' : 'success');
      }
      setEvernoteFile(null);
    } catch (error) {
      console.error('Evernote import failed:', error);
      setStatus(error.response?.data?.error || 'Failed to import Evernote ENEX.', 'error');
    } finally {
      setImporting((previous) => ({ ...previous, enex: false }));
    }
  };

  const handleManualCreate = async (event) => {
    event.preventDefault();
    const cleanText = String(manualText || '').trim();
    if (!cleanText) {
      setStatus('Add note text before creating a note.', 'error');
      return;
    }

    setImporting((previous) => ({ ...previous, manual: true }));
    setImportStats(null);
    setStatus('Creating note...');
    let session = null;
    try {
      session = await createSessionForImport({
        provider: 'files',
        mode: 'manual',
        sourceLabel: manualTitle || 'Manual note',
        sourceType: 'manual-note'
      });
      await patchSession(session?.id, {
        status: 'importing',
        progress: {
          stage: 'saving_note',
          percent: 35,
          indexingState: 'queued'
        }
      });
      const data = await createNotebookFromText({
        title: manualTitle,
        text: cleanText,
        tags: parseTagList(manualTags),
        sourceType: 'manual-note',
        provider: 'files',
        importSessionId: session?.id
      });
      const summary = makeSummaryFromNoteResponse(data);
      setImportStats(summary);
      rememberFirstInsight({
        sourceType: 'manual-note',
        title: manualTitle || data.title || 'Untitled',
        notebookEntryId: summary.entryId,
        counts: summary
      });
      if (session?.id) {
        await patchSession(session.id, {
          status: 'completed',
          progress: {
            stage: 'import_complete',
            percent: 100,
            itemsProcessed: 1,
            itemsTotal: 1,
            indexingState: 'queued'
          },
          result: {
            importedNotes: 1,
            indexingAttempts: 1,
            indexingQueued: 1,
            indexingFailures: 0,
            lastImportedEntryId: summary.entryId
          },
          activation: {
            status: 'captured',
            primaryAction: 'create_concept'
          }
        });
      }
      setStatus('Note created from manual entry.', 'success');
      setManualText('');
      setManualTags('');
      if (!manualTitle.trim()) {
        setManualTitle('');
      }
    } catch (error) {
      console.error('Manual note creation failed:', error);
      setStatus(error.response?.data?.error || error.message || 'Failed to create note.', 'error');
      if (session?.id) {
        await patchSession(session.id, {
          status: 'failed',
          progress: {
            stage: 'failed'
          },
          lastError: error.response?.data?.error || error.message || 'Failed to create note.'
        });
      }
    } finally {
      setImporting((previous) => ({ ...previous, manual: false }));
    }
  };

  const handlePasteFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      setStatus('Clipboard access is not available in this browser.', 'error');
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setStatus('Clipboard is empty.', 'error');
        return;
      }
      setPasteContent(text);
      setStatus('Clipboard content pasted. Choose mode and import.', 'success');
    } catch (error) {
      console.error('Clipboard read failed:', error);
      setStatus('Clipboard permission denied. Paste manually into the text box.', 'error');
    }
  };

  const handlePasteImport = async (event) => {
    event.preventDefault();
    const raw = String(pasteContent || '');
    const text = raw.trim();
    if (!text) {
      setStatus('Paste content before importing.', 'error');
      return;
    }

    setImporting((previous) => ({ ...previous, paste: true }));
    setImportStats(null);
    setStatus('Importing pasted content...');
    let session = null;
    try {
      const resolvedMode = pasteMode === 'auto' ? detectPasteMode(text) : pasteMode;
      session = await createSessionForImport({
        provider: resolvedMode === 'csv' ? 'readwise' : 'files',
        mode: 'paste',
        sourceLabel: pasteTitle || 'Pasted import',
        sourceType: resolvedMode
      });

      if (resolvedMode === 'csv') {
        const csvName = `${String(pasteTitle || 'pasted-readwise').trim().replace(/\s+/g, '-').toLowerCase() || 'pasted-readwise'}.csv`;
        const csvFile = new File([text], csvName, { type: 'text/csv' });
        const data = await importCsvFile(csvFile, session?.id);
        const summary = makeSummaryFromCsvResponse(data);
        setImportStats(summary);
        rememberFirstInsight({
          sourceType: 'readwise-csv',
          title: csvName,
          articleId: summary.articleIds[0] || '',
          counts: summary
        });
        setStatus(summary.indexingFailures > 0 ? 'Pasted CSV imported with indexing warnings.' : 'Pasted CSV imported successfully.', summary.indexingFailures > 0 ? 'warning' : 'success');
      } else if (resolvedMode === 'markdown') {
        const markdownName = `${String(pasteTitle || 'pasted-note').trim().replace(/\s+/g, '-').toLowerCase() || 'pasted-note'}.md`;
        const markdownFile = new File([text], markdownName, { type: 'text/markdown' });
        const data = await importMarkdownFile(markdownFile, session?.id);
        const summary = makeSummaryFromNoteResponse(data);
        setImportStats(summary);
        rememberFirstInsight({
          sourceType: 'markdown',
          title: pasteTitle || 'Pasted markdown note',
          notebookEntryId: summary.entryId,
          counts: summary
        });
        setStatus(summary.indexingFailures > 0 ? 'Pasted markdown imported with indexing warnings.' : 'Pasted markdown imported successfully.', summary.indexingFailures > 0 ? 'warning' : 'success');
      } else {
        await patchSession(session?.id, {
          status: 'importing',
          progress: {
            stage: 'saving_note',
            percent: 35,
            indexingState: 'queued'
          }
        });
        const data = await createNotebookFromText({
          title: pasteTitle,
          text,
          sourceType: 'paste',
          provider: 'files',
          importSessionId: session?.id
        });
        const summary = makeSummaryFromNoteResponse(data);
        setImportStats(summary);
        rememberFirstInsight({
          sourceType: 'paste',
          title: pasteTitle || data.title || 'Untitled',
          notebookEntryId: summary.entryId,
          counts: summary
        });
        if (session?.id) {
          await patchSession(session.id, {
            status: 'completed',
            progress: {
              stage: 'import_complete',
              percent: 100,
              itemsProcessed: 1,
              itemsTotal: 1,
              indexingState: 'queued'
            },
            result: {
              importedNotes: 1,
              indexingAttempts: 1,
              indexingQueued: 1,
              indexingFailures: 0,
              lastImportedEntryId: summary.entryId
            }
          });
        }
        setStatus('Pasted text saved as a notebook note.', 'success');
      }

      if (session?.id) {
        await patchSession(session.id, {
          activation: {
            status: 'captured',
            primaryAction: 'create_concept'
          }
        });
      }
    } catch (error) {
      console.error('Paste import failed:', error);
      setStatus(error.response?.data?.error || error.message || 'Failed to import pasted content.', 'error');
      if (session?.id) {
        await patchSession(session.id, {
          status: 'failed',
          progress: {
            stage: 'failed'
          },
          lastError: error.response?.data?.error || error.message || 'Failed to import pasted content.'
        });
      }
    } finally {
      setImporting((previous) => ({ ...previous, paste: false }));
    }
  };

  const handleCreateConcept = async () => {
    const cleanName = String(conceptName || '').trim();
    if (!cleanName) {
      setConceptError('Enter a concept name first.');
      return;
    }
    setConceptBusy(true);
    setConceptError('');
    try {
      const updated = await updateConcept(cleanName, { description: '' });
      const next = updateFirstInsightState({
        conceptId: String(updated?._id || ''),
        conceptName: updated?.name || cleanName,
        status: 'concept-created'
      });
      setActivationState(next);
      setConceptName(next.conceptName || cleanName);
      setStatus(`Concept "${next.conceptName || cleanName}" is ready.`, 'success');
      trackActivationMilestone({
        milestone: 'first_concept_created',
        sourceType: next.sourceType,
        title: next.title,
        conceptName: next.conceptName || cleanName,
        importedArticles: next.counts?.importedArticles || 0,
        importedHighlights: next.counts?.importedHighlights || 0,
        importedNotes: next.counts?.importedNotes || 0
      });
      if (currentSession?.id) {
        await patchSession(currentSession.id, {
          activation: {
            status: 'concept_created',
            conceptId: String(updated?._id || ''),
            conceptName: updated?.name || cleanName,
            primaryAction: 'create_concept'
          }
        });
      }
    } catch (error) {
      console.error('Concept creation failed:', error);
      setConceptError(error.response?.data?.error || 'Failed to create concept.');
    } finally {
      setConceptBusy(false);
    }
  };

  const handleScheduleRevisit = async (days) => {
    const target = getSchedulableTarget(activationState || readFirstInsightState());
    if (!target) {
      setScheduleError('Create a note or concept first so there is something to revisit.');
      return;
    }
    setScheduleBusy(true);
    setScheduleError('');
    try {
      const dueAt = new Date(Date.now() + Number(days || 0) * 24 * 60 * 60 * 1000).toISOString();
      await createReturnQueueEntry({
        itemType: target.itemType,
        itemId: target.itemId,
        reason: 'First insight follow-up',
        dueAt
      });
      const next = updateFirstInsightState({
        status: 'scheduled',
        dueAt
      });
      setActivationState(next);
      setStatus(`Revisit scheduled in ${days} day${days === 1 ? '' : 's'}.`, 'success');
      trackActivationMilestone({
        milestone: 'revisit_scheduled',
        sourceType: next.sourceType,
        title: next.title,
        conceptName: next.conceptName,
        dueInDays: days,
        importedArticles: next.counts?.importedArticles || 0,
        importedHighlights: next.counts?.importedHighlights || 0,
        importedNotes: next.counts?.importedNotes || 0
      });
      if (currentSession?.id) {
        await patchSession(currentSession.id, {
          activation: {
            status: 'scheduled',
            conceptId: next.conceptId || null,
            conceptName: next.conceptName || '',
            dueAt,
            primaryAction: 'create_concept'
          }
        });
      }
    } catch (error) {
      console.error('Failed to schedule revisit:', error);
      setScheduleError(error.response?.data?.error || 'Failed to schedule revisit.');
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleExportCurrentToNotion = async () => {
    if (!notionConnection?.id) {
      setStatus('Connect Notion first so there is a workspace to export into.', 'error');
      return;
    }

    const activeState = activationState || readFirstInsightState() || {};
    const conceptTarget = String(activeState?.conceptName || '').trim();
    const notebookTarget = String(activeState?.notebookEntryId || '').trim();
    const entityType = conceptTarget ? 'concept' : (notebookTarget ? 'notebook' : '');

    if (!entityType) {
      setStatus('Create a note or concept first, then export it to Notion.', 'error');
      return;
    }

    setNotionExporting(true);
    try {
      const result = await exportToNotionPage({
        connectionId: notionConnection.id,
        entityType,
        conceptName: conceptTarget,
        notebookEntryId: notebookTarget
      });
      setNotionExportResult(result?.page || null);
      setStatus(
        result?.page?.url
          ? `Exported "${result.page.title}" to Notion.`
          : 'Exported the current item to Notion.',
        'success'
      );
    } catch (error) {
      console.error('Failed to export current item to Notion:', error);
      setStatus(error.response?.data?.error || 'Failed to export to Notion.', 'error');
    } finally {
      setNotionExporting(false);
    }
  };

  const persistedActivationState = activationState || readFirstInsightState();
  const importStatsActivationState = importStats
    ? {
        status: 'captured',
        sourceType: selectedSource,
        title: currentSession?.sourceLabel || 'Imported item',
        notebookEntryId: importStats.entryId || '',
        conceptId: '',
        conceptName: '',
        articleId: importStats.articleIds?.[0] || '',
        dueAt: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        counts: importStats
      }
    : null;
  const sessionResultActivationState = currentSession?.result
    ? {
        status: currentSession?.activation?.status || 'captured',
        sourceType: currentSession?.config?.sourceType || currentSession?.provider || selectedSource,
        title: currentSession?.sourceLabel || 'Imported item',
        notebookEntryId: currentSession?.result?.lastImportedEntryId || '',
        conceptId: currentSession?.activation?.conceptId ? String(currentSession.activation.conceptId) : '',
        conceptName: currentSession?.activation?.conceptName || '',
        articleId: currentSession?.result?.lastImportedArticleId || '',
        dueAt: currentSession?.activation?.dueAt || '',
        createdAt: currentSession?.createdAt || new Date().toISOString(),
        updatedAt: currentSession?.updatedAt || currentSession?.createdAt || new Date().toISOString(),
        counts: currentSession.result
      }
    : null;
  const derivedActivationState = persistedActivationState || importStatsActivationState || sessionResultActivationState;
  const hasActiveInsight = isFirstInsightActive(derivedActivationState);
  const showActivationPanel = hasActiveInsight
    || Boolean(importStats?.entryId)
    || Boolean(importStats?.articleIds?.length)
    || ['completed', 'completed_with_warnings'].includes(currentSession?.status)
    || ['captured', 'concept_created', 'scheduled'].includes(currentSession?.activation?.status);
  const scheduleTarget = getSchedulableTarget(derivedActivationState);
  const canExportCurrentToNotion = Boolean(
    notionConnection?.id
    && (String(derivedActivationState?.conceptName || '').trim() || String(derivedActivationState?.notebookEntryId || '').trim())
  );
  const readwiseAgentConnection = readwiseConnections.find(connection => connection?.mode === 'mcp_remote')
    || (readwiseConnection?.mode === 'mcp_remote' ? readwiseConnection : null);
  const readwiseDirectConnection = readwiseConnections.find(connection => connection?.mode !== 'mcp_remote')
    || (readwiseConnection?.mode && readwiseConnection.mode !== 'mcp_remote' ? readwiseConnection : null);
  const readwiseSyncConnection = readwiseDirectConnection || (readwiseConnection?.mode !== 'mcp_remote' ? readwiseConnection : null);
  const busy = importing.manual
    || importing.paste
    || importing.csv
    || importing.md
    || importing.enex
    || previewing.readwise
    || previewing.notion
    || previewing.evernote
    || readwiseMcpConnecting
    || readwiseConnecting
    || readwiseChecking
    || readwiseSyncing
    || notionChecking
    || notionConnecting
    || notionSyncing
    || notionExporting;
  const sessionTone = getSessionTone(currentSession);
  const sessionMessage = getSessionMessage(currentSession);
  const showOrganizeImportCta = Boolean(
    currentSession
    && ['completed', 'completed_with_warnings'].includes(currentSession.status)
    && (
      currentSession.recommendedNextAction === 'organize_import'
      || hasPendingOrganizeImportSuggestion(currentSession)
    )
  );
  const selectedSourcePreview = getPreviewForSource(currentSession, selectedSource);
  const activationCopy = getActivationCopy({
    state: derivedActivationState,
    session: currentSession,
    scheduleTarget
  });
  const importReceipt = getReceiptDestination({
    sourceKey: selectedSource,
    session: currentSession,
    importStats,
    sourceLabel: lastImportSourceLabel
  });
  const directReadwiseReady = Boolean(readwiseSyncConnection?.id && readwiseSyncConnection.mode !== 'mcp_remote');
  const readwiseFeedStatus = directReadwiseReady
    ? (readwiseSyncConnection.lastSyncAt ? 'Import feed active' : 'Ready to sync')
    : readwiseAgentConnection?.id
      ? 'Agent access connected'
      : 'Not connected';
  const readwiseFeedDetail = directReadwiseReady
    ? (readwiseSyncConnection.lastSyncAt
      ? `Last Readwise sync: ${formatLoopDate(readwiseSyncConnection.lastSyncAt)}.`
      : 'Run Sync from Readwise to move new highlights into the Library and return loop.')
    : readwiseAgentConnection?.id
      ? 'Browser approval is ready for agents. Direct Library refresh still needs the advanced token sync or a CSV import.'
      : 'Connect with Readwise to give agents browser-approved access, then add direct sync when you want Library imports.';
  const notionConnectionState = describeNotionConnectionState(notionConnection);
  const notionSyncResultLine = describeNotionSyncResult({
    stats: lastImportSourceLabel === (notionConnection?.accountLabel || 'Notion') ? importStats : null,
    session: currentSession,
    connection: notionConnection
  });
  const notionFeedStatus = notionConnectionState.status;
  const notionFeedDetail = notionConnection?.id
    ? notionConnectionState.detail
    : 'Connect Notion to let workspace pages become retrievable notes and source material.';
  const latestManualSessionProvider = ['evernote', 'files'].includes(currentSession?.provider) ? currentSession.provider : '';
  const latestManualImportFinished = Boolean(
    latestManualSessionProvider
    && ['completed', 'completed_with_warnings'].includes(currentSession?.status)
  );
  const manualFeedStatus = latestManualImportFinished
    ? 'Last manual import saved'
    : 'Manual handoff';
  const manualFeedDetail = latestManualImportFinished
    ? `${getProviderLabel(latestManualSessionProvider)} import last updated ${formatLoopDate(getSessionLoopDate(currentSession))}.`
    : 'Evernote, CSV, markdown, paste, and one-off notes enter the same downstream retrieval path after you import them.';
  const connectedLoopCount = [
    directReadwiseReady,
    Boolean(readwiseAgentConnection?.id),
    Boolean(notionConnection?.id),
    latestManualImportFinished
  ].filter(Boolean).length;
  const returnLoopHandoff = describeLoopHandoff({
    readwiseConnection: readwiseSyncConnection || readwiseAgentConnection,
    notionConnection,
    session: currentSession
  });

  const sourceContent = (
    <>
      <Card className="settings-card connections-return-loop" data-testid="connections-return-loop">
        <div className="connections-return-loop__header">
          <div>
            <p className="muted-label">Return loop</p>
            <h2>What is feeding Morning Paper?</h2>
            <p className="muted">
              Connected sources add fresh material; scheduled wiki maintenance checks due pages about every six hours.
            </p>
          </div>
          <div className="connections-return-loop__summary" aria-label={`${connectedLoopCount} source handoffs active`}>
            <strong>{connectedLoopCount}</strong>
            <span>active handoffs</span>
          </div>
        </div>
        <div className="connections-return-loop__grid">
          <div className="connections-return-loop__feed">
            <span className="connections-return-loop__dot" aria-hidden="true" />
            <div>
              <p className="muted-label">Readwise</p>
              <strong>{readwiseFeedStatus}</strong>
              <p className="muted small">{readwiseFeedDetail}</p>
            </div>
          </div>
          <div className="connections-return-loop__feed">
            <span className="connections-return-loop__dot" aria-hidden="true" />
            <div>
              <p className="muted-label">Notion</p>
              <strong>{notionFeedStatus}</strong>
              <p className="muted small">{notionFeedDetail}</p>
            </div>
          </div>
          <div className="connections-return-loop__feed">
            <span className="connections-return-loop__dot" aria-hidden="true" />
            <div>
              <p className="muted-label">Files, Evernote, CSV</p>
              <strong>{manualFeedStatus}</strong>
              <p className="muted small">{manualFeedDetail}</p>
            </div>
          </div>
        </div>
        <p className="connections-return-loop__handoff">{returnLoopHandoff}</p>
      </Card>

      <Card className="settings-card">
        <h2>Choose a source</h2>
        <p className="muted">The goal is a source-aware path: import, preserve context, then activate the material inside Think.</p>
        <div className="import-source-grid">
          {SOURCE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`import-source-card ${selectedSource === option.key ? 'is-active' : ''}`}
              onClick={() => setSelectedSource(option.key)}
            >
              <span className="import-source-status">{option.status}</span>
              <h3>{option.title}</h3>
              <p>{option.subtitle}</p>
              <span className="import-source-helper">{option.helper}</span>
            </button>
          ))}
        </div>
      </Card>

      {(sessionMessage || importStatus.message || importStats || currentSession) && (
        <Card className="settings-card">
          <div className="import-session-header">
            <div>
              <h2>Current import state</h2>
              <p className="muted">
                {sessionLoading ? 'Loading current session…' : (currentSession?.sourceLabel || 'No active session')}
              </p>
            </div>
            {currentSession?.status ? <p className="muted-label">{currentSession.status.replace(/_/g, ' ')}</p> : null}
          </div>
          {sessionMessage ? (
            <p className={`status-message ${sessionTone === 'success' ? 'success-message' : ''} ${sessionTone === 'error' ? 'error-message' : ''}`}>
              {sessionMessage}
            </p>
          ) : null}
          {importStatus.message ? (
            <p className={`status-message ${importStatus.tone === 'success' ? 'success-message' : ''} ${importStatus.tone === 'error' ? 'error-message' : ''}`}>
              {importStatus.message}
            </p>
          ) : null}
          {currentSession?.progress ? (
            <div className="import-session-grid">
              <div className="import-session-metric">
                <span className="muted-label">Stage</span>
                <strong>{currentSession.progress.stage || 'draft'}</strong>
              </div>
              <div className="import-session-metric">
                <span className="muted-label">Progress</span>
                <strong>{currentSession.progress.percent || 0}%</strong>
              </div>
              <div className="import-session-metric">
                <span className="muted-label">Semantic readiness</span>
                <strong>{currentSession.progress.indexingState || 'not_started'}</strong>
              </div>
            </div>
          ) : null}
          {selectedSourcePreview ? (
            <div className="import-preview" data-testid="import-preview">
              <p className="muted-label">Preview snapshot</p>
              <div className="import-session-grid">
                <div className="import-session-metric">
                  <span className="muted-label">Items</span>
                  <strong>{selectedSourcePreview.items || 0}</strong>
                </div>
                <div className="import-session-metric">
                  <span className="muted-label">Articles / pages</span>
                  <strong>{(selectedSourcePreview.articles || 0) + (selectedSourcePreview.pages || 0)}</strong>
                </div>
                <div className="import-session-metric">
                  <span className="muted-label">Highlights / notes</span>
                  <strong>{(selectedSourcePreview.highlights || 0) + (selectedSourcePreview.notes || 0)}</strong>
                </div>
              </div>
              {selectedSourcePreview.sampleTitles?.length ? (
                <p className="muted small">Samples: {selectedSourcePreview.sampleTitles.join(' · ')}</p>
              ) : null}
              {selectedSourcePreview.sampleAuthors?.length ? (
                <p className="muted small">Authors: {selectedSourcePreview.sampleAuthors.join(' · ')}</p>
              ) : null}
              {selectedSourcePreview.sampleTags?.length ? (
                <p className="muted small">Tags: {selectedSourcePreview.sampleTags.join(' · ')}</p>
              ) : null}
              {selectedSourcePreview.sampleDatabases?.length ? (
                <p className="muted small">Databases: {selectedSourcePreview.sampleDatabases.join(' · ')}</p>
              ) : null}
              {selectedSourcePreview.warningCodes?.length ? (
                <p className="muted small">Warning codes: {selectedSourcePreview.warningCodes.join(' · ')}</p>
              ) : null}
              {selectedSourcePreview.warnings?.length ? (
                <p className="muted small">{selectedSourcePreview.warnings.join(' · ')}</p>
              ) : null}
            </div>
          ) : null}
          {importStats ? (
            <div className="import-summary">
              <p className="muted-label">Import result</p>
              <p>Articles imported: {importStats.importedArticles}</p>
              <p>Highlights imported: {importStats.importedHighlights}</p>
              <p>Notes imported: {importStats.importedNotes}</p>
              <p>Rows skipped: {importStats.skippedRows}</p>
              <p>Skipped duplicates: {importStats.duplicateSkips || 0}</p>
              <p>Skipped invalid rows: {importStats.invalidSkips || 0}</p>
              <p>Parse errors: {importStats.parseErrors}</p>
              <p>Indexing queued: {importStats.indexingQueued}</p>
              <p>Indexing failures: {importStats.indexingFailures}</p>
              {importStats.warningCodes?.length ? (
                <p className="muted small">Warning codes: {importStats.warningCodes.join(' · ')}</p>
              ) : null}
              {importStats.warnings?.length ? (
                <p className="muted small">{importStats.warnings.join(' · ')}</p>
              ) : null}
              {importStats.entryId ? (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => navigate(`/think?tab=notebook&entryId=${encodeURIComponent(importStats.entryId)}`)}
                >
                  Open note in Think
                </Button>
              ) : null}
            </div>
          ) : null}
          {importReceipt ? (
            <div className="import-callout" data-testid="import-receipt">
              <p className="muted-label">{importReceipt.heading}</p>
              <p className="muted small">{importReceipt.body}</p>
              <div className="capture-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate(importReceipt.primaryPath)}
                >
                  {importReceipt.primaryLabel}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate(importReceipt.secondaryPath)}
                >
                  {importReceipt.secondaryLabel}
                </Button>
              </div>
            </div>
          ) : null}
          {showOrganizeImportCta ? (
            <div className="import-callout">
              <p className="muted-label">{AGENT_DISPLAY_NAME} next step</p>
              <p className="muted small">
                Imported text is ready. If you want, {AGENT_DISPLAY_NAME} can stage a folder cleanup plan before anything moves.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={handleOrganizeImport}
                disabled={organizeLaunching}
              >
                {organizeLaunching ? 'Starting…' : 'Organize this import'}
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      {selectedSource === 'readwise' && (
        <Card className="settings-card" id="readwise">
          <h2>Readwise connection</h2>
          <p className="muted">Connect through the browser. Noeis sends you to Readwise, you log in, and the connection comes back ready for agent access.</p>
          <div className="import-callout">
            <p className="muted-label">Recommended: browser approval</p>
            <p className="muted small">Use this path first. It opens Readwise in your browser for approval, then stores the connection for Noeis and MCP-capable agents. You do not need to paste an API token.</p>
            <p className="muted small">MCP server: <code>{READWISE_MCP_SERVER_URL}</code></p>
            <div className="capture-actions">
              <Button
                type="button"
                onClick={handleReadwiseBrowserConnect}
                disabled={busy || readwiseMcpConnecting}
              >
                {readwiseMcpConnecting ? 'Opening…' : 'Connect with Readwise'}
              </Button>
              <a href={READWISE_MCP_DOCS_URL} target="_blank" rel="noopener noreferrer">Readwise MCP setup</a>
            </div>
          </div>
          <details className="import-callout" style={{ marginBottom: 18 }}>
            <summary className="muted-label">Advanced: direct sync with API token</summary>
            <p className="muted small">Use this only when you want Noeis to run the legacy Readwise export sync itself. Browser approval is the default connection path for agents.</p>
            {readwiseAgentConnection?.id && !readwiseDirectConnection?.id ? (
              <p className="muted small">Browser access is connected. Direct Library import is intentionally paused until you add an API token or upload a Readwise CSV.</p>
            ) : null}
            <div className="capture-form">
              <label className="capture-label" htmlFor="readwise-account-label">Connection label</label>
              <input
                id="readwise-account-label"
                className="capture-input"
                type="text"
                value={readwiseLabel}
                onChange={(event) => setReadwiseLabel(event.target.value)}
                placeholder="Readwise"
                disabled={busy || readwiseConnecting || readwiseSyncing}
              />
              <a href={READWISE_TOKEN_HELP_URL} target="_blank" rel="noopener noreferrer">Get Readwise token</a>
              <label className="capture-label" htmlFor="readwise-token-input">Readwise API token</label>
              <input
                id="readwise-token-input"
                className="capture-input"
                type="password"
                value={readwiseToken}
                onChange={(event) => setReadwiseToken(event.target.value)}
                placeholder="Paste token from Readwise"
                disabled={busy || readwiseConnecting || readwiseSyncing}
              />
              <div className="capture-actions">
                <Button
                  type="button"
                  onClick={handleReadwiseConnect}
                  disabled={busy || readwiseConnecting || readwiseChecking || readwiseSyncing}
                >
                  {readwiseConnecting ? 'Connecting…' : readwiseConnection?.id ? 'Update token' : 'Connect with token'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleReadwiseCheck}
                  disabled={busy || readwiseConnecting || readwiseChecking || readwiseSyncing || !readwiseConnection?.id}
                >
                  {readwiseChecking ? 'Checking…' : 'Check connection'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleReadwiseSync}
                  disabled={busy || readwiseConnecting || readwiseChecking || readwiseSyncing || !readwiseSyncConnection?.id}
                >
                  {readwiseSyncing ? 'Syncing…' : 'Sync from Readwise'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleReadwisePreview}
                  disabled={busy || readwiseConnecting || readwiseChecking || readwiseSyncing || !readwiseSyncConnection?.id}
                >
                  {previewing.readwise ? 'Previewing…' : 'Preview scope'}
                </Button>
              </div>
            </div>
          </details>
          {readwiseConnection ? (
            <div className="import-summary" style={{ marginBottom: 16 }}>
              <p className="muted-label">Connected account</p>
              <p>Label: {readwiseConnection.accountLabel || 'Readwise'}</p>
              <p>Mode: {readwiseConnection.mode === 'mcp_remote' ? 'Readwise MCP / OAuth' : readwiseConnection.mode || 'manual'}</p>
              <p>Status: {readwiseConnection.status || 'connected'}</p>
              <p>Health: {readwiseConnection.health || 'unknown'}</p>
              {readwiseAgentConnection?.id ? <p>Agent access: connected</p> : null}
              {readwiseDirectConnection?.id ? <p>Direct import: token connection ready</p> : <p>Direct import: add an API token or CSV when you want Library sync.</p>}
              {readwiseAgentConnection?.id && !readwiseDirectConnection?.id ? (
                <div className="capture-actions">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => csvInputRef.current?.click()}
                    disabled={busy}
                  >
                    Upload Readwise CSV
                  </Button>
                  <a href={READWISE_TOKEN_HELP_URL} target="_blank" rel="noopener noreferrer">Add API token</a>
                </div>
              ) : null}
              {readwiseConnection.mode === 'mcp_remote' && readwiseConnection.externalAccountId ? <p>MCP server: {readwiseConnection.externalAccountId}</p> : null}
              <p>Last checked: {readwiseConnection.lastValidatedAt ? new Date(readwiseConnection.lastValidatedAt).toLocaleString() : 'Never'}</p>
              <p>Last preview: {readwiseConnection.lastPreviewAt ? new Date(readwiseConnection.lastPreviewAt).toLocaleString() : 'Never'}</p>
              <p>Last sync: {readwiseConnection.lastSyncAt ? new Date(readwiseConnection.lastSyncAt).toLocaleString() : 'Never'}</p>
              {readwiseConnection.lastError ? <p className="muted small">{readwiseConnection.lastError}</p> : null}
            </div>
          ) : null}
          <div className="settings-import-row">
            <div>
              <p className="muted-label">Readwise CSV</p>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleReadwiseImport}
                disabled={busy}
              />
            </div>
            <Button
              variant="secondary"
              type="button"
              onClick={() => csvInputRef.current?.click()}
              disabled={busy}
            >
              {importing.csv ? 'Importing…' : 'Upload CSV'}
            </Button>
          </div>
        </Card>
      )}

      {selectedSource === 'notion' && (
        <Card className="settings-card" id="notion">
          <h2>Notion import</h2>
          <p className="muted">Connect Notion once, then sync accessible pages plus database row content into notebook entries that the model can retrieve.</p>
          <div className={`import-summary import-summary--${notionConnectionState.tone}`} data-testid="notion-sync-receipt">
            <p className="muted-label">Notion status</p>
            <p><strong>{notionConnectionState.status}</strong></p>
            <p>{notionConnectionState.headline}</p>
            <p className="muted small">{notionConnectionState.detail}</p>
            {notionConnection?.lastSyncAt ? (
              <p className="muted small">Where it lands: Library search, Think retrieval, and Morning Paper source maintenance.</p>
            ) : null}
            {notionSyncResultLine ? (
              <p className="muted small">{notionSyncResultLine}</p>
            ) : null}
          </div>
          <div className="import-callout">
            <p className="muted-label">Live flow</p>
            <p className="muted small">OAuth connect opens Notion, returns here, previews shared pages and data sources, then syncs them into notebook entries.</p>
            {notionSetupMissingEnv.length ? (
              <p className="status-message error-message" data-testid="notion-setup-warning">
                This button is the Notion connection flow. It cannot redirect until the server has {notionSetupMissingEnv.join(' and ')} configured.
              </p>
            ) : null}
          </div>
          <div className="capture-actions" style={{ marginBottom: 16 }}>
            <Button
              type="button"
              onClick={handleNotionConnect}
              disabled={busy || notionConnecting || notionChecking || notionSyncing}
            >
              {notionConnecting ? 'Redirecting…' : notionConnection?.id ? 'Reconnect Notion' : 'Connect Notion'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleNotionCheck}
              disabled={busy || notionConnecting || notionChecking || notionSyncing || !notionConnection?.id}
            >
              {notionChecking ? 'Checking…' : 'Check connection'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleNotionSync}
              disabled={busy || notionConnecting || notionChecking || notionSyncing || !notionConnection?.id}
            >
              {notionSyncing ? 'Syncing…' : 'Sync from Notion'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleNotionPreview}
              disabled={busy || notionConnecting || notionChecking || notionSyncing || !notionConnection?.id}
            >
              {previewing.notion ? 'Previewing…' : 'Preview scope'}
            </Button>
          </div>
          {/* Agent-mediated Notion fetch lives in its own card so the
              status, counts, last-fetched timestamp, and error list have
              room to breathe. The card stays compact when there's no
              result yet — it's a single button + body copy in that
              state. */}
          <NotionAgentFetchCard
            connected={Boolean(notionConnection?.id)}
            fetching={notionAgentFetching}
            result={notionAgentResult}
            disabled={busy || notionConnecting || notionChecking || notionSyncing}
            onFetch={handleNotionAgentFetch}
          />
          {notionConnection ? (
            <div className="import-summary">
              <p className="muted-label">Connected workspace</p>
              <p>Label: {notionConnection.accountLabel || 'Notion'}</p>
              <p>Status: {notionConnection.status || 'connected'}</p>
              <p>Health: {notionConnection.health || 'unknown'}</p>
              <p>Last checked: {notionConnection.lastValidatedAt ? new Date(notionConnection.lastValidatedAt).toLocaleString() : 'Never'}</p>
              <p>Last preview: {notionConnection.lastPreviewAt ? new Date(notionConnection.lastPreviewAt).toLocaleString() : 'Never'}</p>
              <p>Last sync: {notionConnection.lastSyncAt ? new Date(notionConnection.lastSyncAt).toLocaleString() : 'Never'}</p>
              {notionConnection.lastError ? <p className="muted small">{notionConnection.lastError}</p> : null}
              {canExportCurrentToNotion ? (
                <div className="capture-actions" style={{ marginTop: 12 }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleExportCurrentToNotion}
                    disabled={busy}
                  >
                    {notionExporting
                      ? 'Exporting…'
                      : (String(derivedActivationState?.conceptName || '').trim()
                        ? 'Export current concept to Notion'
                        : 'Export current note to Notion')}
                  </Button>
                </div>
              ) : null}
              {notionExportResult?.url ? (
                <p className="muted small" style={{ marginTop: 8 }}>
                  Latest export:{' '}
                  <a href={notionExportResult.url} target="_blank" rel="noopener noreferrer">
                    {notionExportResult.title || 'Open in Notion'}
                  </a>
                </p>
              ) : null}
            </div>
          ) : (
            <p className="muted small">Share pages or databases with the integration after connecting so they can be discovered by Notion search.</p>
          )}
        </Card>
      )}

      {selectedSource === 'evernote' && (
        <Card className="settings-card" id="evernote">
          <h2>Evernote import</h2>
          <p className="muted">Evernote lands through ENEX as notebook entries with tags, dates, source identity, and semantic indexing queued behind the import.</p>
          <div className="import-callout">
            <p className="muted-label">Fastest self-serve path</p>
            <p className="muted small">1. Export a notebook or notes as `.enex` from the Evernote desktop app.</p>
            <p className="muted small">2. Drop that file here to preview parsed notes and tags before anything is imported.</p>
            <p className="muted small">3. Import into Think, where Noeis mirrors the ENEX name as the destination folder and lets you activate the notes.</p>
            <p className="muted small">Browser OAuth sync is technically possible, but Evernote requires reviewed API access for apps that read existing notes. ENEX is the reliable path you can use today without waiting on vendor approval.</p>
            <a href={EVERNOTE_EXPORT_HELP_URL} target="_blank" rel="noopener noreferrer">Evernote export instructions</a>
          </div>
          <div
            className={`import-dropzone ${evernoteDragActive ? 'is-active' : ''}`}
            onDragOver={handleEvernoteDragOver}
            onDragLeave={handleEvernoteDragLeave}
            onDrop={handleEvernoteDrop}
          >
            <div>
              <p className="muted-label">Evernote ENEX</p>
              <p className="muted small">Drag and drop a `.enex` file here, or choose one manually.</p>
              <input
                ref={enexInputRef}
                type="file"
                accept=".enex,application/xml,text/xml"
                onChange={handleEvernoteFileSelected}
                disabled={busy}
              />
            </div>
            <Button
              variant="secondary"
              type="button"
              onClick={() => enexInputRef.current?.click()}
              disabled={busy}
            >
              Choose ENEX
            </Button>
          </div>
          {evernoteFile ? (
            <div className="import-summary">
              <p className="muted-label">Selected file</p>
              <p>{evernoteFile.name}</p>
              <p className="muted small">Preview before import if you want to confirm note counts, titles, and tags first.</p>
            </div>
          ) : null}
          <div className="capture-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={handleEvernotePreview}
              disabled={busy || !evernoteFile}
            >
              {previewing.evernote ? 'Previewing…' : 'Preview ENEX'}
            </Button>
            <Button
              type="button"
              onClick={handleEvernoteImport}
              disabled={busy || !evernoteFile}
            >
              {importing.enex ? 'Importing…' : 'Import ENEX'}
            </Button>
          </div>
        </Card>
      )}

      {selectedSource === 'files' && (
        <>
          <Card className="settings-card">
            <h2>Manual note entry</h2>
            <p className="muted">Create notebook entries directly in the web UI while still recording import/session metadata for activation.</p>
            <form className="capture-form" onSubmit={handleManualCreate}>
              <label className="capture-label" htmlFor="manual-note-title">Title</label>
              <input
                id="manual-note-title"
                className="capture-input"
                type="text"
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                placeholder="Untitled"
                disabled={busy}
              />
              <label className="capture-label" htmlFor="manual-note-text">Note text</label>
              <textarea
                id="manual-note-text"
                className="capture-textarea"
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
                placeholder="Write or paste a note..."
                rows={8}
                disabled={busy}
              />
              <label className="capture-label" htmlFor="manual-note-tags">Tags (comma separated)</label>
              <input
                id="manual-note-tags"
                className="capture-input"
                type="text"
                value={manualTags}
                onChange={(event) => setManualTags(event.target.value)}
                placeholder="research, strategy"
                disabled={busy}
              />
              <div className="capture-actions">
                <Button type="submit" disabled={busy}>
                  {importing.manual ? 'Creating…' : 'Create note'}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="settings-card">
            <h2>Direct paste import</h2>
            <p className="muted">Paste plain text, markdown, or Readwise CSV and run it through the same session + activation pipeline.</p>
            <form className="capture-form" onSubmit={handlePasteImport}>
              <label className="capture-label" htmlFor="paste-note-title">Title (optional)</label>
              <input
                id="paste-note-title"
                className="capture-input"
                type="text"
                value={pasteTitle}
                onChange={(event) => setPasteTitle(event.target.value)}
                placeholder="Used for plain text and markdown imports"
                disabled={busy}
              />
              <label className="capture-label" htmlFor="paste-import-mode">Import mode</label>
              <select
                id="paste-import-mode"
                className="capture-input"
                value={pasteMode}
                onChange={(event) => setPasteMode(event.target.value)}
                disabled={busy}
              >
                <option value="auto">Auto detect</option>
                <option value="plain">Plain text → notebook note</option>
                <option value="markdown">Markdown file import</option>
                <option value="csv">Readwise CSV import</option>
              </select>
              <label className="capture-label" htmlFor="paste-import-content">Pasted content</label>
              <textarea
                id="paste-import-content"
                className="capture-textarea"
                value={pasteContent}
                onChange={(event) => setPasteContent(event.target.value)}
                placeholder="Paste text, markdown, or CSV..."
                rows={9}
                disabled={busy}
              />
              <div className="capture-actions">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={handlePasteFromClipboard}
                  disabled={busy}
                >
                  Paste from clipboard
                </Button>
                <Button type="submit" disabled={busy}>
                  {importing.paste ? 'Importing…' : 'Import pasted content'}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="settings-card">
            <h2>Markdown or CSV upload</h2>
            <p className="muted">Upload exported markdown notes or Readwise CSV files into the same import session system.</p>
            <div className="settings-import-row">
              <div>
                <p className="muted-label">Markdown or CSV files</p>
                <input
                  ref={mdInputRef}
                  type="file"
                  aria-label="Markdown or CSV upload"
                  accept=".md,.markdown,text/markdown,.csv,text/csv"
                  onChange={handleFileImport}
                  disabled={busy}
                />
              </div>
              <Button
                variant="secondary"
                type="button"
                onClick={() => mdInputRef.current?.click()}
                disabled={busy}
              >
                {importing.md ? 'Importing…' : 'Upload file'}
              </Button>
            </div>
          </Card>
        </>
      )}

      {showActivationPanel && (
        <Card className="settings-card first-insight-card" data-testid="first-insight-card">
          <h2>{activationCopy.heading}</h2>
          <p className="muted">{activationCopy.intro}</p>
          <p className="muted-label">{activationCopy.progressLabel}</p>
          <p className="first-insight-summary">{getFirstInsightSummary(derivedActivationState)}</p>
          <div className="capture-actions first-insight-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(getFirstInsightOpenPath(derivedActivationState))}
            >
              {derivedActivationState?.conceptName ? 'Open concept in Think' : derivedActivationState?.notebookEntryId ? 'Open note in Think' : 'Open current item'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/today')}>
              Open Today
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/review?tab=reflections')}>
              Open Review
            </Button>
            {canExportCurrentToNotion && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleExportCurrentToNotion}
                disabled={busy}
              >
                {notionExporting
                  ? 'Exporting…'
                  : (String(derivedActivationState?.conceptName || '').trim()
                    ? 'Export concept to Notion'
                    : 'Export note to Notion')}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                clearFirstInsightState();
                setActivationState(null);
                setConceptName('');
                setConceptError('');
                setScheduleError('');
                setNotionExportResult(null);
              }}
            >
              Clear
            </Button>
          </div>
          {notionExportResult?.url ? (
            <p className="muted small">
              Latest Notion export:{' '}
              <a href={notionExportResult.url} target="_blank" rel="noopener noreferrer">
                {notionExportResult.title || 'Open page'}
              </a>
            </p>
          ) : null}

          <div className="first-insight-grid">
            <div className="first-insight-panel">
              <p className="muted-label">{activationCopy.recommendationLabel}</p>
              <p className="muted small">{activationCopy.recommendationText}</p>
              {activationCopy.seedLine ? <p className="muted small">{activationCopy.seedLine}</p> : null}
              <label className="capture-label" htmlFor="first-insight-concept-name">{activationCopy.conceptLabel}</label>
              <input
                id="first-insight-concept-name"
                data-testid="first-insight-concept-input"
                className="capture-input"
                type="text"
                value={conceptName}
                onChange={(event) => setConceptName(event.target.value)}
                placeholder={activationCopy.conceptPlaceholder}
                disabled={conceptBusy}
              />
              <div className="capture-actions">
                <Button
                  type="button"
                  data-testid="first-insight-create-concept"
                  onClick={handleCreateConcept}
                  disabled={conceptBusy}
                >
                  {conceptBusy ? 'Creating…' : derivedActivationState?.conceptName ? 'Update concept target' : 'Create concept'}
                </Button>
                {derivedActivationState?.conceptName && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate(`/think?tab=concepts&concept=${encodeURIComponent(derivedActivationState.conceptName)}`)}
                  >
                    Open concept
                  </Button>
                )}
              </div>
              {conceptError && <p className="status-message error-message">{conceptError}</p>}
            </div>

            <div className="first-insight-panel">
              <p className="muted-label">{activationCopy.closeLoopLabel}</p>
              <p className="muted small">{activationCopy.closeLoopText}</p>
              <div className="capture-actions">
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="first-insight-schedule-1d"
                  onClick={() => handleScheduleRevisit(1)}
                  disabled={scheduleBusy || !scheduleTarget}
                >
                  1 day
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="first-insight-schedule-3d"
                  onClick={() => handleScheduleRevisit(3)}
                  disabled={scheduleBusy || !scheduleTarget}
                >
                  3 days
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="first-insight-schedule-7d"
                  onClick={() => handleScheduleRevisit(7)}
                  disabled={scheduleBusy || !scheduleTarget}
                >
                  7 days
                </Button>
              </div>
              {scheduleError && <p className="status-message error-message">{scheduleError}</p>}
            </div>
          </div>
        </Card>
      )}

      <Card className="settings-card">
        <h2>Import rules</h2>
        <p className="muted">Import success should never depend on perfect semantic readiness. Persist the text first, then make indexing state explicit and resumable.</p>
      </Card>
    </>
  );

  if (embedded) {
    return (
      <div
        className="connections-sources-section data-integrations-page"
        data-testid="connections-sources"
      >
        {sourceContent}
      </div>
    );
  }

  return (
    <Page className="settings-page data-integrations-page">
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Bring your knowledge</h1>
        <p className="muted">Choose a source, import the text cleanly, then turn it into a concept instead of leaving it as a dead archive.</p>
      </div>

      <Card className="settings-card data-integrations-agent-setup">
        <div>
          <p className="muted-label">Connected agents</p>
          <h2>Need OpenClaw or Hermes?</h2>
          <p className="muted">
            Use the connections center for one-command browser approval. Raw bridge/runtime config lives under Advanced.
          </p>
        </div>
        <div className="settings-option-row">
          <Button type="button" variant="secondary" onClick={() => navigate('/connections#agents')}>
            Open agent setup
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowAdvancedBridgeSetup((previous) => !previous)}
          >
            {showAdvancedBridgeSetup ? 'Hide advanced bridge' : 'Show advanced bridge'}
          </Button>
        </div>
      </Card>

      {showAdvancedBridgeSetup ? (
        <ExternalBridgeCard
          bridgeModel={bridgeModel}
          sortedAgents={personalAgentsModel.sortedAgents}
        />
      ) : null}

      {sourceContent}
    </Page>
  );
};

export default DataIntegrations;
