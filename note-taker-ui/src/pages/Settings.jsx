import React, { useState } from 'react';
import Export from './Export';
import api from '../api';
import { Page, Card, Button } from '../components/ui';

const getAuthConfig = () => {
  const token = localStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
};

const Settings = () => {
  const [importStatus, setImportStatus] = useState('');
  const [importStats, setImportStats] = useState(null);
  const [importing, setImporting] = useState({ csv: false, md: false });

  const handleReadwiseImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(prev => ({ ...prev, csv: true }));
    setImportStatus('Importing Readwise CSV...');
    setImportStats(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/import/readwise-csv', formData, getAuthConfig());
      setImportStats({
        importedArticles: res.data.importedArticles || 0,
        importedHighlights: res.data.importedHighlights || 0,
        importedNotes: res.data.importedNotes || 0,
        skippedRows: res.data.skippedRows || 0,
        parseErrors: res.data.parseErrors || 0
      });
      setImportStatus('Readwise import complete.');
    } catch (err) {
      console.error('Readwise import failed:', err);
      setImportStatus(err.response?.data?.error || 'Failed to import Readwise CSV.');
    } finally {
      setImporting(prev => ({ ...prev, csv: false }));
      event.target.value = '';
    }
  };

  const handleMarkdownImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(prev => ({ ...prev, md: true }));
    setImportStatus('Importing markdown note...');
    setImportStats(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/import/markdown', formData, getAuthConfig());
      setImportStats({
        importedArticles: 0,
        importedHighlights: 0,
        importedNotes: res.data.importedNotes || 0,
        skippedRows: 0,
        parseErrors: 0
      });
      setImportStatus('Markdown import complete.');
    } catch (err) {
      console.error('Markdown import failed:', err);
      setImportStatus(err.response?.data?.error || 'Failed to import markdown file.');
    } finally {
      setImporting(prev => ({ ...prev, md: false }));
      event.target.value = '';
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Settings</h1>
        <p className="muted">Export your data and keep your workspace organized.</p>
      </div>
      <Card className="settings-card">
        <h2>Onboarding</h2>
        <p className="muted">Need a refresher? Restart the onboarding guide.</p>
        <Button
          variant="secondary"
          onClick={() => {
            localStorage.removeItem('onboardingComplete');
            localStorage.removeItem('onboardingStep');
            localStorage.removeItem('hasCreatedHighlight');
            localStorage.removeItem('hasTaggedHighlight');
            localStorage.removeItem('hasCreatedNote');
            localStorage.removeItem('hasInsertedHighlightIntoNote');
          }}
        >
          Restart Onboarding
        </Button>
      </Card>
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
          <Button variant="secondary" disabled={importing.csv || importing.md}>
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
          <Button variant="secondary" disabled={importing.csv || importing.md}>
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
      <Export />
    </Page>
  );
};

export default Settings;
