import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { Page, Button, SectionHeader, QuietButton } from '../components/ui';

const ranges = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' }
];

const Brain = () => {
  const [timeRange, setTimeRange] = useState('30d');
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('idle');
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [error, setError] = useState('');

  const authHeaders = useCallback(() => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/brain/summary?timeRange=${timeRange}`, authHeaders());
      setStatus(res.data?.status || 'missing');
      setSummary(res.data?.summary || null);
    } catch (err) {
      console.error('Error loading brain summary:', err);
      setError(err.response?.data?.error || 'Failed to load insights.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, timeRange]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleGenerate = async () => {
    setQueueing(true);
    setError('');
    try {
      await api.post('/api/brain/generate', { timeRange }, authHeaders());
      setStatus('queued');
    } catch (err) {
      console.error('Error queuing brain summary:', err);
      setError(err.response?.data?.error || 'Failed to queue generation.');
    } finally {
      setQueueing(false);
    }
  };

  useEffect(() => {
    if (status !== 'queued') return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      await loadSummary();
      if (tries > 12) clearInterval(timer);
    }, 5000);
    return () => clearInterval(timer);
  }, [status, loadSummary]);

  const generatedAt = summary?.generatedAt
    ? new Date(summary.generatedAt).toLocaleString()
    : null;
  const sourceCount = summary?.sourceCount || 0;

  const themes = useMemo(() => summary?.themes || [], [summary]);
  const connections = useMemo(() => summary?.connections || [], [summary]);
  const questions = useMemo(() => summary?.questions || [], [summary]);

  return (
    <Page>
      <div className="page-header">
        <p className="muted-label">Brain</p>
        <h1>Brain Summary</h1>
        <p className="muted">Themes, connections, and open questions — generated locally.</p>
      </div>

      <div className="section-stack">
        <div className="brain-controls">
          <div className="brain-range">
            {ranges.map(range => (
              <QuietButton
                key={range.value}
                className={`list-button ${timeRange === range.value ? 'is-active' : ''}`}
                onClick={() => setTimeRange(range.value)}
              >
                {range.label}
              </QuietButton>
            ))}
          </div>
          <Button variant="secondary" onClick={handleGenerate} disabled={queueing}>
            {queueing ? 'Queuing…' : 'Generate / Refresh'}
          </Button>
        </div>
        {generatedAt && (
          <p className="muted small">
            Last generated: {generatedAt} · {sourceCount} highlights
            {status === 'stale' && ' · stale'}
          </p>
        )}
      </div>

      {loading && <p className="status-message">Loading insights...</p>}
      {error && <p className="status-message error-message">{error}</p>}

      {summary && (
        <div className="section-stack">
          <SectionHeader title="Themes" subtitle="Recurring threads and ideas." />
          {themes.length === 0 ? (
            <p className="muted small">No themes yet.</p>
          ) : (
            <div className="brain-list">
              {themes.map((item, idx) => (
                <div key={`${item}-${idx}`} className="brain-row">{item}</div>
              ))}
            </div>
          )}

          <SectionHeader title="Connections" subtitle="Links across concepts." />
          {connections.length === 0 ? (
            <p className="muted small">No connections yet.</p>
          ) : (
            <div className="brain-list">
              {connections.map((item, idx) => (
                <div key={`${item}-${idx}`} className="brain-row">{item}</div>
              ))}
            </div>
          )}

          <SectionHeader title="Open questions" subtitle="What to chase next." />
          {questions.length === 0 ? (
            <p className="muted small">No questions yet.</p>
          ) : (
            <div className="brain-list">
              {questions.map((item, idx) => (
                <div key={`${item}-${idx}`} className="brain-row">{item}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </Page>
  );
};

export default Brain;
