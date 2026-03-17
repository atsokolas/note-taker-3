import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Button, Card, Page } from '../components/ui';
import { updateConcept } from '../api/concepts';
import {
  checkNotionConnection,
  checkReadwiseConnection,
  connectReadwiseToken,
  createImportSession,
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
import {
  clearFirstInsightState,
  getFirstInsightOpenPath,
  getFirstInsightSummary,
  isFirstInsightActive,
  readFirstInsightState,
  saveFirstInsightState,
  updateFirstInsightState
} from '../utils/firstInsight';

const SOURCE_OPTIONS = [
  {
    key: 'readwise',
    title: 'Readwise',
    subtitle: 'Bring in highlights and notes from your reading layer.',
    status: 'Available today',
    helper: 'Direct token-based sync and preview are live, with CSV still available as fallback.'
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

const DataIntegrations = () => {
  const navigate = useNavigate();
  const [selectedSource, setSelectedSource] = useState('readwise');
  const [importStatus, setImportStatus] = useState({ tone: '', message: '' });
  const [importStats, setImportStats] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [importing, setImporting] = useState({ csv: false, md: false, enex: false, manual: false, paste: false });
  const [previewing, setPreviewing] = useState({ readwise: false, notion: false, evernote: false });
  const [readwiseToken, setReadwiseToken] = useState('');
  const [readwiseLabel, setReadwiseLabel] = useState('Readwise');
  const [readwiseConnection, setReadwiseConnection] = useState(null);
  const [readwiseConnecting, setReadwiseConnecting] = useState(false);
  const [readwiseChecking, setReadwiseChecking] = useState(false);
  const [readwiseSyncing, setReadwiseSyncing] = useState(false);
  const [notionConnection, setNotionConnection] = useState(null);
  const [notionSetupMissingEnv, setNotionSetupMissingEnv] = useState([]);
  const [notionChecking, setNotionChecking] = useState(false);
  const [notionConnecting, setNotionConnecting] = useState(false);
  const [notionSyncing, setNotionSyncing] = useState(false);
  const [evernoteFile, setEvernoteFile] = useState(null);
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
    let cancelled = false;
    const loadReadwiseConnection = async () => {
      try {
        const connections = await listImportConnections({ provider: 'readwise' });
        if (cancelled) return;
        const latest = connections[0] || null;
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
    const notionState = params.get('notion');
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
    }
  }, []);

  const setStatus = (message, tone = 'info') => {
    setImportStatus({ message, tone });
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
    if (session) setCurrentSession(session);
    return session;
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
    return next;
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
      setReadwiseToken('');
      setStatus('Readwise connected. You can sync directly now.', 'success');
    } catch (error) {
      console.error('Readwise connect failed:', error);
      setStatus(error.response?.data?.error || 'Failed to validate Readwise token.', 'error');
    } finally {
      setReadwiseConnecting(false);
    }
  };

  const handleReadwisePreview = async () => {
    if (!readwiseConnection?.id) {
      setStatus('Connect Readwise first.', 'error');
      return;
    }
    setPreviewing((previous) => ({ ...previous, readwise: true }));
    setImportStats(null);
    setStatus('Previewing Readwise content...');
    try {
      const session = await ensureSessionForSource({
        provider: 'readwise',
        mode: 'api_token',
        sourceLabel: readwiseConnection.accountLabel || 'Readwise',
        sourceType: 'api'
      });
      const data = await previewReadwiseConnection({
        connectionId: readwiseConnection.id,
        importSessionId: session?.id
      });
      if (data?.session) {
        setCurrentSession(data.session);
      }
      if (data?.connection) {
        setReadwiseConnection(data.connection);
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
    if (!readwiseConnection?.id) {
      setStatus('Connect Readwise first.', 'error');
      return;
    }
    setReadwiseChecking(true);
    setStatus('Checking Readwise connection...');
    try {
      const data = await checkReadwiseConnection({
        connectionId: readwiseConnection.id
      });
      if (data?.connection) {
        setReadwiseConnection(data.connection);
      }
      setStatus('Readwise connection is healthy.', 'success');
    } catch (error) {
      console.error('Readwise connection check failed:', error);
      if (error.response?.data?.connection) {
        setReadwiseConnection(error.response.data.connection);
      }
      setStatus(error.response?.data?.error || 'Failed to check Readwise connection.', 'error');
    } finally {
      setReadwiseChecking(false);
    }
  };

  const handleReadwiseSync = async () => {
    if (!readwiseConnection?.id) {
      setStatus('Connect Readwise first.', 'error');
      return;
    }
    setReadwiseSyncing(true);
    setImportStats(null);
    setStatus('Syncing from Readwise...');
    try {
      const session = await ensureSessionForSource({
        provider: 'readwise',
        mode: 'api_token',
        sourceLabel: readwiseConnection.accountLabel || 'Readwise',
        sourceType: 'api'
      });
      const data = await syncReadwiseConnection({
        connectionId: readwiseConnection.id,
        importSessionId: session?.id
      });
      const summary = makeSummaryFromCsvResponse(data);
      setImportStats(summary);
      if (data?.connection) {
        setReadwiseConnection(data.connection);
      }
      if ((summary.importedArticles || 0) > 0 || (summary.importedHighlights || 0) > 0) {
        rememberFirstInsight({
          sourceType: 'readwise-api',
          title: readwiseConnection.accountLabel || 'Readwise sync',
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

  const handleNotionSync = async () => {
    if (!notionConnection?.id) {
      setStatus('Connect Notion first.', 'error');
      return;
    }
    setNotionSyncing(true);
    setImportStats(null);
    setStatus('Syncing from Notion...');
    try {
      const session = await ensureSessionForSource({
        provider: 'notion',
        mode: 'oauth',
        sourceLabel: notionConnection.accountLabel || 'Notion',
        sourceType: 'oauth'
      });
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
    setEvernoteFile(file);
    setStatus(`Selected ${file.name}. Preview or import when ready.`, 'info');
    event.target.value = '';
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
  const busy = importing.manual
    || importing.paste
    || importing.csv
    || importing.md
    || importing.enex
    || previewing.readwise
    || previewing.notion
    || previewing.evernote
    || readwiseConnecting
    || readwiseChecking
    || readwiseSyncing
    || notionChecking
    || notionConnecting
    || notionSyncing;
  const sessionTone = getSessionTone(currentSession);
  const sessionMessage = getSessionMessage(currentSession);
  const selectedSourcePreview = getPreviewForSource(currentSession, selectedSource);
  const activationCopy = getActivationCopy({
    state: derivedActivationState,
    session: currentSession,
    scheduleTarget
  });

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Bring your knowledge</h1>
        <p className="muted">Choose a source, import the text cleanly, then turn it into a concept instead of leaving it as a dead archive.</p>
      </div>

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
        </Card>
      )}

      {selectedSource === 'readwise' && (
        <Card className="settings-card">
          <h2>Readwise import</h2>
          <p className="muted">Connect a Readwise token once, then sync directly into the same import-session and activation pipeline used by file imports.</p>
          <div className="import-callout">
            <p className="muted-label">Direct connect</p>
            <p className="muted small">Token-based Readwise sync is live in this pass. Import persistence succeeds even if semantic indexing needs a follow-up pass.</p>
          </div>
          <div className="capture-form" style={{ marginBottom: 18 }}>
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
                {readwiseConnecting ? 'Connecting…' : readwiseConnection?.id ? 'Update token' : 'Connect Readwise'}
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
                disabled={busy || readwiseConnecting || readwiseChecking || readwiseSyncing || !readwiseConnection?.id}
              >
                {readwiseSyncing ? 'Syncing…' : 'Sync from Readwise'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleReadwisePreview}
                disabled={busy || readwiseConnecting || readwiseChecking || readwiseSyncing || !readwiseConnection?.id}
              >
                {previewing.readwise ? 'Previewing…' : 'Preview scope'}
              </Button>
            </div>
          </div>
          {readwiseConnection ? (
            <div className="import-summary" style={{ marginBottom: 16 }}>
              <p className="muted-label">Connected account</p>
              <p>Label: {readwiseConnection.accountLabel || 'Readwise'}</p>
              <p>Status: {readwiseConnection.status || 'connected'}</p>
              <p>Health: {readwiseConnection.health || 'unknown'}</p>
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
        <Card className="settings-card">
          <h2>Notion import</h2>
          <p className="muted">Connect Notion once, then sync accessible pages plus database row content into notebook entries that the model can retrieve.</p>
          <div className="import-callout">
            <p className="muted-label">Planned flow</p>
            <p className="muted small">OAuth connect → fetch pages and data sources shared with the integration → import them into notebook entries → create first concept.</p>
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
            </div>
          ) : (
            <p className="muted small">Share pages or databases with the integration after connecting so they can be discovered by Notion search.</p>
          )}
        </Card>
      )}

      {selectedSource === 'evernote' && (
        <Card className="settings-card">
          <h2>Evernote import</h2>
          <p className="muted">Evernote lands through ENEX as notebook entries with tags, dates, source identity, and semantic indexing queued behind the import.</p>
          <div className="import-callout">
            <p className="muted-label">Planned flow</p>
            <p className="muted small">Upload ENEX → parse notes and tags → persist notebook entries → queue semantic indexing → create first concept from the imported notes.</p>
          </div>
          <div className="settings-import-row">
            <div>
              <p className="muted-label">Evernote ENEX</p>
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                clearFirstInsightState();
                setActivationState(null);
                setConceptName('');
                setConceptError('');
                setScheduleError('');
              }}
            >
              Clear
            </Button>
          </div>

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
    </Page>
  );
};

export default DataIntegrations;
