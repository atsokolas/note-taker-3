import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Button, Card, Page } from '../components/ui';

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

const DataIntegrations = () => {
  const navigate = useNavigate();
  const [importStatus, setImportStatus] = useState({ tone: '', message: '' });
  const [importStats, setImportStats] = useState(null);
  const [importing, setImporting] = useState({ csv: false, md: false, manual: false, paste: false });
  const [manualTitle, setManualTitle] = useState('');
  const [manualText, setManualText] = useState('');
  const [manualTags, setManualTags] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [pasteMode, setPasteMode] = useState('auto');
  const csvInputRef = useRef(null);
  const mdInputRef = useRef(null);

  const setStatus = (message, tone = 'info') => {
    setImportStatus({ message, tone });
  };

  const makeSummaryFromCsvResponse = (responseData = {}) => ({
    importedArticles: responseData.importedArticles || 0,
    importedHighlights: responseData.importedHighlights || 0,
    importedNotes: responseData.importedNotes || 0,
    skippedRows: responseData.skippedRows || 0,
    parseErrors: responseData.parseErrors || 0,
    entryId: ''
  });

  const makeSummaryFromNoteResponse = (responseData = {}) => ({
    importedArticles: 0,
    importedHighlights: 0,
    importedNotes: responseData.importedNotes || 1,
    skippedRows: 0,
    parseErrors: 0,
    entryId: String(responseData.entryId || responseData._id || '')
  });

  const createNotebookFromText = async ({ title, text, tags = [] }) => {
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
      tags
    }, getAuthConfig());
    return response.data;
  };

  const importCsvFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/api/import/readwise-csv', formData, getAuthConfig());
    return response.data;
  };

  const importMarkdownFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/api/import/markdown', formData, getAuthConfig());
    return response.data;
  };

  const handleReadwiseImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting((previous) => ({ ...previous, csv: true }));
    setStatus('Importing Readwise CSV...');
    setImportStats(null);
    try {
      const data = await importCsvFile(file);
      setImportStats(makeSummaryFromCsvResponse(data));
      setStatus('Readwise import complete.', 'success');
    } catch (error) {
      console.error('Readwise import failed:', error);
      setStatus(error.response?.data?.error || 'Failed to import Readwise CSV.', 'error');
    } finally {
      setImporting((previous) => ({ ...previous, csv: false }));
      event.target.value = '';
    }
  };

  const handleMarkdownImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting((previous) => ({ ...previous, md: true }));
    setStatus('Importing markdown note...');
    setImportStats(null);
    try {
      const data = await importMarkdownFile(file);
      setImportStats(makeSummaryFromNoteResponse(data));
      setStatus('Markdown import complete.', 'success');
    } catch (error) {
      console.error('Markdown import failed:', error);
      setStatus(error.response?.data?.error || 'Failed to import markdown file.', 'error');
    } finally {
      setImporting((previous) => ({ ...previous, md: false }));
      event.target.value = '';
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
    try {
      const data = await createNotebookFromText({
        title: manualTitle,
        text: cleanText,
        tags: parseTagList(manualTags)
      });
      setImportStats(makeSummaryFromNoteResponse(data));
      setStatus('Note created from manual entry.', 'success');
      setManualText('');
      setManualTags('');
      if (!manualTitle.trim()) {
        setManualTitle('');
      }
    } catch (error) {
      console.error('Manual note creation failed:', error);
      setStatus(error.response?.data?.error || error.message || 'Failed to create note.', 'error');
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
    try {
      const resolvedMode = pasteMode === 'auto' ? detectPasteMode(text) : pasteMode;
      if (resolvedMode === 'csv') {
        const csvName = `${String(pasteTitle || 'pasted-readwise').trim().replace(/\s+/g, '-').toLowerCase() || 'pasted-readwise'}.csv`;
        const csvFile = new File([text], csvName, { type: 'text/csv' });
        const data = await importCsvFile(csvFile);
        setImportStats(makeSummaryFromCsvResponse(data));
        setStatus('Pasted CSV imported successfully.', 'success');
      } else if (resolvedMode === 'markdown') {
        const markdownName = `${String(pasteTitle || 'pasted-note').trim().replace(/\s+/g, '-').toLowerCase() || 'pasted-note'}.md`;
        const markdownFile = new File([text], markdownName, { type: 'text/markdown' });
        const data = await importMarkdownFile(markdownFile);
        setImportStats(makeSummaryFromNoteResponse(data));
        setStatus('Pasted markdown imported successfully.', 'success');
      } else {
        const data = await createNotebookFromText({
          title: pasteTitle,
          text
        });
        setImportStats(makeSummaryFromNoteResponse(data));
        setStatus('Pasted text saved as a notebook note.', 'success');
      }
    } catch (error) {
      console.error('Paste import failed:', error);
      setStatus(error.response?.data?.error || error.message || 'Failed to import pasted content.', 'error');
    } finally {
      setImporting((previous) => ({ ...previous, paste: false }));
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Data integrations</h1>
        <p className="muted">Capture and import notes without the Chrome extension.</p>
      </div>

      <Card className="settings-card">
        <h2>Manual note entry</h2>
        <p className="muted">Create notebook entries directly in web UI for standalone evaluation.</p>
        <form className="capture-form" onSubmit={handleManualCreate}>
          <label className="capture-label" htmlFor="manual-note-title">Title</label>
          <input
            id="manual-note-title"
            className="capture-input"
            type="text"
            value={manualTitle}
            onChange={(event) => setManualTitle(event.target.value)}
            placeholder="Untitled"
            disabled={importing.manual || importing.paste || importing.csv || importing.md}
          />
          <label className="capture-label" htmlFor="manual-note-text">Note text</label>
          <textarea
            id="manual-note-text"
            className="capture-textarea"
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder="Write or paste a note..."
            rows={8}
            disabled={importing.manual || importing.paste || importing.csv || importing.md}
          />
          <label className="capture-label" htmlFor="manual-note-tags">Tags (comma separated)</label>
          <input
            id="manual-note-tags"
            className="capture-input"
            type="text"
            value={manualTags}
            onChange={(event) => setManualTags(event.target.value)}
            placeholder="research, strategy"
            disabled={importing.manual || importing.paste || importing.csv || importing.md}
          />
          <div className="capture-actions">
            <Button type="submit" disabled={importing.manual || importing.paste || importing.csv || importing.md}>
              {importing.manual ? 'Creating…' : 'Create note'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="settings-card">
        <h2>Direct paste import</h2>
        <p className="muted">Paste plain text, markdown, or Readwise CSV and import in one click.</p>
        <form className="capture-form" onSubmit={handlePasteImport}>
          <label className="capture-label" htmlFor="paste-note-title">Title (optional)</label>
          <input
            id="paste-note-title"
            className="capture-input"
            type="text"
            value={pasteTitle}
            onChange={(event) => setPasteTitle(event.target.value)}
            placeholder="Used for plain text and markdown imports"
            disabled={importing.manual || importing.paste || importing.csv || importing.md}
          />
          <label className="capture-label" htmlFor="paste-import-mode">Import mode</label>
          <select
            id="paste-import-mode"
            className="capture-input"
            value={pasteMode}
            onChange={(event) => setPasteMode(event.target.value)}
            disabled={importing.manual || importing.paste || importing.csv || importing.md}
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
            disabled={importing.manual || importing.paste || importing.csv || importing.md}
          />
          <div className="capture-actions">
            <Button
              variant="secondary"
              type="button"
              onClick={handlePasteFromClipboard}
              disabled={importing.manual || importing.paste || importing.csv || importing.md}
            >
              Paste from clipboard
            </Button>
            <Button type="submit" disabled={importing.manual || importing.paste || importing.csv || importing.md}>
              {importing.paste ? 'Importing…' : 'Import pasted content'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="settings-card">
        <h2>File imports</h2>
        <p className="muted">Upload Readwise CSV or Markdown files into your workspace.</p>
        <div className="settings-import-row">
          <div>
            <p className="muted-label">Readwise CSV</p>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleReadwiseImport}
              disabled={importing.csv || importing.md || importing.manual || importing.paste}
            />
          </div>
          <Button
            variant="secondary"
            type="button"
            onClick={() => csvInputRef.current?.click()}
            disabled={importing.csv || importing.md || importing.manual || importing.paste}
          >
            {importing.csv ? 'Importing…' : 'Upload CSV'}
          </Button>
        </div>
        <div className="settings-import-row">
          <div>
            <p className="muted-label">Markdown notes</p>
            <input
              ref={mdInputRef}
              type="file"
              accept=".md,text/markdown"
              onChange={handleMarkdownImport}
              disabled={importing.csv || importing.md || importing.manual || importing.paste}
            />
          </div>
          <Button
            variant="secondary"
            type="button"
            onClick={() => mdInputRef.current?.click()}
            disabled={importing.csv || importing.md || importing.manual || importing.paste}
          >
            {importing.md ? 'Importing…' : 'Upload Markdown'}
          </Button>
        </div>
        {importStatus.message && (
          <p className={`status-message ${importStatus.tone === 'success' ? 'success-message' : ''} ${importStatus.tone === 'error' ? 'error-message' : ''}`}>
            {importStatus.message}
          </p>
        )}
        {importStats && (
          <div className="import-summary">
            <p className="muted-label">Summary</p>
            <p>Articles imported: {importStats.importedArticles}</p>
            <p>Highlights imported: {importStats.importedHighlights}</p>
            <p>Notes imported: {importStats.importedNotes}</p>
            <p>Rows skipped: {importStats.skippedRows}</p>
            <p>Parse errors: {importStats.parseErrors}</p>
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
        )}
      </Card>

      <Card className="settings-card">
        <h2>Export</h2>
        <p className="muted">Export notebooks or concepts as markdown directly from Think.</p>
      </Card>

      <Card className="settings-card">
        <h2>Sharing</h2>
        <p className="muted">Make a concept public and share a read-only link.</p>
      </Card>
    </Page>
  );
};

export default DataIntegrations;
