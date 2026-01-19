import React, { useState } from 'react';
import api from '../api';
import { Page, Card, Button } from '../components/ui';

const getAuthConfig = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});

const Integrations = () => {
  const [importStatus, setImportStatus] = useState('');
  const [importStats, setImportStats] = useState(null);
  const [importing, setImporting] = useState(false);

  const handleReadwiseImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportStatus('Importing Readwise CSV...');
    setImportStats(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/import/readwise', formData, getAuthConfig());
      setImportStats({
        importedArticles: res.data.importedArticles || 0,
        importedHighlights: res.data.importedHighlights || 0,
        skippedRows: res.data.skippedRows || 0,
        parseErrors: res.data.parseErrors || 0
      });
      setImportStatus('Readwise import complete.');
    } catch (err) {
      console.error('Readwise import failed:', err);
      setImportStatus(err.response?.data?.error || 'Failed to import Readwise CSV.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Mode</p>
        <h1>Integrations</h1>
        <p className="muted">Bring your library in, export clean markdown, and share public concepts.</p>
      </div>

      <Card className="settings-card">
        <h2>Import</h2>
        <p className="muted">Upload a Readwise CSV to seed your highlights.</p>
        <div className="settings-import-row">
          <div>
            <p className="muted-label">Readwise CSV</p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleReadwiseImport}
              disabled={importing}
            />
          </div>
          <Button variant="secondary" disabled={importing}>
            {importing ? 'Importing…' : 'Upload CSV'}
          </Button>
        </div>
        {importStatus && <p className="status-message">{importStatus}</p>}
        {importStats && (
          <div className="import-summary">
            <p className="muted-label">Summary</p>
            <p>Articles imported: {importStats.importedArticles}</p>
            <p>Highlights imported: {importStats.importedHighlights}</p>
            <p>Rows skipped: {importStats.skippedRows}</p>
            <p>Parse errors: {importStats.parseErrors}</p>
          </div>
        )}
      </Card>

      <Card className="settings-card">
        <h2>Export</h2>
        <p className="muted">
          Export notebooks or concepts as markdown directly from Think → Notebook or Think → Concepts.
        </p>
      </Card>

      <Card className="settings-card">
        <h2>Sharing</h2>
        <p className="muted">Make a concept public and share a read-only link.</p>
      </Card>
    </Page>
  );
};

export default Integrations;
