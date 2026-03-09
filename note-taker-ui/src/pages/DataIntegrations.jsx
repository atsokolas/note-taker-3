import React, { useState } from 'react';
import api from '../api';
import { Button, Card, Page } from '../components/ui';

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

const DataIntegrations = () => {
  const [importStatus, setImportStatus] = useState('');
  const [importStats, setImportStats] = useState(null);
  const [importing, setImporting] = useState({ csv: false, md: false });

  const handleReadwiseImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting((previous) => ({ ...previous, csv: true }));
    setImportStatus('Importing Readwise CSV...');
    setImportStats(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/api/import/readwise', formData, getAuthConfig());
      setImportStats({
        importedArticles: response.data.importedArticles || 0,
        importedHighlights: response.data.importedHighlights || 0,
        importedNotes: response.data.importedNotes || 0,
        skippedRows: response.data.skippedRows || 0,
        parseErrors: response.data.parseErrors || 0
      });
      setImportStatus('Readwise import complete.');
    } catch (error) {
      console.error('Readwise import failed:', error);
      setImportStatus(error.response?.data?.error || 'Failed to import Readwise CSV.');
    } finally {
      setImporting((previous) => ({ ...previous, csv: false }));
      event.target.value = '';
    }
  };

  const handleMarkdownImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting((previous) => ({ ...previous, md: true }));
    setImportStatus('Importing markdown note...');
    setImportStats(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/api/import/markdown', formData, getAuthConfig());
      setImportStats({
        importedArticles: 0,
        importedHighlights: 0,
        importedNotes: response.data.importedNotes || 0,
        skippedRows: 0,
        parseErrors: 0
      });
      setImportStatus('Markdown import complete.');
    } catch (error) {
      console.error('Markdown import failed:', error);
      setImportStatus(error.response?.data?.error || 'Failed to import markdown file.');
    } finally {
      setImporting((previous) => ({ ...previous, md: false }));
      event.target.value = '';
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Data integrations</h1>
        <p className="muted">Import source content into your workspace from external tools.</p>
      </div>

      <Card className="settings-card">
        <h2>Import your data</h2>
        <p className="muted">Bring highlights from Readwise or markdown notes into your workspace.</p>
        <div className="settings-import-row">
          <div>
            <p className="muted-label">Readwise CSV</p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleReadwiseImport}
              disabled={importing.csv || importing.md}
            />
          </div>
          <Button variant="secondary" type="button" disabled={importing.csv || importing.md}>
            {importing.csv ? 'Importing…' : 'Upload CSV'}
          </Button>
        </div>
        <div className="settings-import-row">
          <div>
            <p className="muted-label">Markdown notes</p>
            <input
              type="file"
              accept=".md,text/markdown"
              onChange={handleMarkdownImport}
              disabled={importing.csv || importing.md}
            />
          </div>
          <Button variant="secondary" type="button" disabled={importing.csv || importing.md}>
            {importing.md ? 'Importing…' : 'Upload Markdown'}
          </Button>
        </div>
        {importStatus && <p className="status-message">{importStatus}</p>}
        {importStats && (
          <div className="import-summary">
            <p className="muted-label">Summary</p>
            <p>Articles imported: {importStats.importedArticles}</p>
            <p>Highlights imported: {importStats.importedHighlights}</p>
            <p>Notes imported: {importStats.importedNotes}</p>
            <p>Rows skipped: {importStats.skippedRows}</p>
            <p>Parse errors: {importStats.parseErrors}</p>
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
