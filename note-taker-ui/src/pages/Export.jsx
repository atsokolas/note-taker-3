import React, { useState } from 'react';
import api from '../api';
import { Page, Card, Button } from '../components/ui';

const Export = () => {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const downloadPdfZip = async () => {
    setLoading(true);
    setStatus('');
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/api/export/pdf-zip', {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `note-taker-export-pdfs.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('PDF bundle downloaded.');
    } catch (err) {
      console.error('PDF export failed:', err);
      setError(err.response?.data?.error || 'Failed to export PDF bundle.');
    } finally {
      setLoading(false);
    }
  };

  const downloadJson = async () => {
    setLoading(true);
    setStatus('');
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/api/export/json', { headers: { Authorization: `Bearer ${token}` } });
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `note-taker-export-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Export downloaded.');
    } catch (err) {
      console.error('Export failed:', err);
      setError(err.response?.data?.error || 'Failed to export data.');
    } finally {
      setLoading(false);
    }
  };

  const copyJson = async () => {
    setLoading(true);
    setStatus('');
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/api/export/json', { headers: { Authorization: `Bearer ${token}` } });
      await navigator.clipboard.writeText(JSON.stringify(res.data, null, 2));
      setStatus('Copied JSON to clipboard.');
    } catch (err) {
      console.error('Copy export failed:', err);
      setError(err.response?.data?.error || 'Failed to copy data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Settings</p>
        <h1>Export your data</h1>
        <p className="muted">Download everything: articles, highlights, notebook entries, collections, and tag metadata.</p>
      </div>
      <Card className="search-section">
        <div className="section-stack">
          <Button onClick={downloadPdfZip} disabled={loading}>
            {loading ? 'Preparing…' : 'Download PDF Bundle'}
          </Button>
          <Button onClick={downloadJson} disabled={loading}>
            {loading ? 'Preparing…' : 'Download JSON Export'}
          </Button>
          <Button variant="secondary" onClick={copyJson} disabled={loading}>Copy JSON to clipboard</Button>
          {status && <p className="status-message success-message">{status}</p>}
          {error && <p className="status-message error-message">{error}</p>}
        </div>
      </Card>
    </Page>
  );
};

export default Export;
