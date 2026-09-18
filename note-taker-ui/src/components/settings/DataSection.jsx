import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';

const buildManifestFromPayload = (payload) => {
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  const highlights = Array.isArray(payload?.highlights) ? payload.highlights : [];
  const notebookEntries = Array.isArray(payload?.notebookEntries) ? payload.notebookEntries : [];
  return {
    exportedAt: payload?.exportedAt || new Date().toISOString(),
    articles: articles.length,
    highlights: highlights.length,
    notebookEntries: notebookEntries.length,
    collections: Array.isArray(payload?.collections) ? payload.collections.length : 0,
    omissions: ['Credentials', 'Agent tokens', 'Wiki instructions', 'Delivery address', 'Sessions']
  };
};

const DataSection = () => {
  const [manifest, setManifest] = useState(null);
  const [manifestError, setManifestError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const loadManifest = async () => {
    setLoading(true);
    setManifestError('');
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/api/export/json', { headers: { Authorization: `Bearer ${token}` } });
      setManifest(buildManifestFromPayload(res.data));
    } catch (err) {
      setManifestError(err.response?.data?.error || 'Could not inspect export contents.');
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
      a.href = url;
      a.download = `note-taker-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Structured export download requested. Check your downloads folder to confirm the file landed.');
      setManifest(buildManifestFromPayload(res.data));
    } catch (err) {
      setError(err.response?.data?.error || 'Export failed.');
    } finally {
      setLoading(false);
    }
  };

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
      a.download = 'note-taker-export-pdfs.zip';
      a.click();
      URL.revokeObjectURL(url);
      setStatus('PDF bundle download requested.');
    } catch (err) {
      setError(err.response?.data?.error || 'PDF export failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <div className="settings-redesign__pagehead">
        <div>
          <h2>Your data</h2>
          <p className="settings-redesign__help" style={{ marginTop: '0.45rem' }}>Know what leaves with you.</p>
        </div>
        <span className="settings-redesign__eyebrow">Private export</span>
      </div>

      <div className="settings-redesign__data-row" id="export-json">
        <div className="settings-redesign__eyebrow" style={{ border: '1px solid var(--settings-rule)', padding: '0.5rem', textAlign: 'center' }}>JSON</div>
        <div>
          <h3 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400, margin: '0 0 0.35rem' }}>Structured export</h3>
          <p className="settings-redesign__help">Articles, highlights, notebook entries, collections, tags, and saved views. Not a restorable backup by itself.</p>
        </div>
        <button type="button" className="settings-redesign__link" onClick={loadManifest} disabled={loading}>
          Review contents →
        </button>
      </div>

      <div className="settings-redesign__data-row">
        <div className="settings-redesign__eyebrow" style={{ border: '1px solid var(--settings-rule)', padding: '0.5rem', textAlign: 'center' }}>PDF</div>
        <div>
          <h3 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400, margin: '0 0 0.35rem' }}>Reading copy</h3>
          <p className="settings-redesign__help">A readable bundle for keeping outside NOEIS. A reading copy is not the same as a restorable workspace.</p>
        </div>
        <button type="button" className="settings-redesign__link" onClick={downloadPdfZip} disabled={loading}>Download →</button>
      </div>

      {manifest ? (
        <div className="settings-redesign__quiet" style={{ marginTop: '1rem' }}>
          <span className="settings-redesign__eyebrow">Export manifest</span>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0', fontSize: '0.75rem' }}>
            <li className="settings-redesign__fact"><span>Articles</span><span>{manifest.articles}</span></li>
            <li className="settings-redesign__fact"><span>Highlights</span><span>{manifest.highlights}</span></li>
            <li className="settings-redesign__fact"><span>Notebook entries</span><span>{manifest.notebookEntries}</span></li>
            <li className="settings-redesign__fact"><span>Collections</span><span>{manifest.collections}</span></li>
            <li className="settings-redesign__fact"><span>Not included</span><span>{manifest.omissions.join(', ')}</span></li>
          </ul>
          <button type="button" className="settings-redesign__btn is-primary" style={{ marginTop: '1rem' }} onClick={downloadJson} disabled={loading}>
            Download structured JSON
          </button>
        </div>
      ) : null}
      {manifestError ? <p className="settings-redesign__help" role="alert">{manifestError}</p> : null}
      {status ? <div className="settings-redesign__receipt" role="status">{status}</div> : null}
      {error ? <div className="settings-redesign__receipt is-error" role="alert">{error}</div> : null}

      <div style={{ marginTop: '2rem', borderTop: '1px solid var(--settings-rule)', paddingTop: '1.5rem' }}>
        <h3 style={{ fontFamily: 'var(--noeis-serif, Georgia, serif)', fontWeight: 400 }}>Connections and access</h3>
        <p className="settings-redesign__help">Sources, agent credentials, permissions and revocation have one home.</p>
        <Link to="/connections" className="settings-redesign__link">Open Connections ↗</Link>
      </div>
    </section>
  );
};

export default DataSection;
