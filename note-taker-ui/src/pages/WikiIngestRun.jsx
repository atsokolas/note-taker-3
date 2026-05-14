import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createWikiPage, getWikiIngestRun, undoWikiIngestRun } from '../api/wiki';

const labelFor = (value = '') => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, char => char.toUpperCase());

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const WikiIngestRun = () => {
  const { runId } = useParams();
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getWikiIngestRun(runId)
      .then((data) => {
        if (!cancelled) setRun(data || null);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load ingest run.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [runId]);

  const timeline = Array.isArray(run?.timeline) ? run.timeline : [];

  const handleCreatePage = async () => {
    if (!run?.suggestedCreatePage) return;
    setActing(true);
    setError('');
    setStatus('');
    try {
      const page = await createWikiPage({
        title: run.suggestedCreatePage.title,
        pageType: 'source',
        sourceScope: 'selected_sources',
        createdFrom: {
          type: 'sources',
          text: run.sourceRef?.summary || run.sourceRef?.text || '',
          label: run.sourceRef?.title || run.suggestedCreatePage.title
        },
        initialSourceRef: run.suggestedCreatePage.source || run.sourceRef
      });
      setStatus(`Created "${page.title || run.suggestedCreatePage.title}".`);
    } catch (_error) {
      setError('Failed to create wiki page from this source.');
    } finally {
      setActing(false);
    }
  };

  const handleUndo = async () => {
    setActing(true);
    setError('');
    setStatus('');
    try {
      const updated = await undoWikiIngestRun(runId);
      setRun(current => ({ ...(current || {}), ...(updated || {}) }));
      setStatus(`Restored ${updated.restoredPageIds?.length || 0} page${updated.restoredPageIds?.length === 1 ? '' : 's'}.`);
    } catch (_error) {
      setError('Failed to undo this ingest run.');
    } finally {
      setActing(false);
    }
  };

  return (
    <main className="wiki-page wiki-index wiki-ingest-run">
      <Link className="wiki-ingest-run__back" to="/wiki">Back to graph</Link>
      <section className="wiki-index__header">
        <div className="wiki-index__title-block">
          <p className="wiki-index__eyebrow">Ingest run</p>
          <h1>{run?.sourceRef?.title || 'Source update'}</h1>
          <p>{run?.summary || 'Timeline of how this source changed the wiki.'}</p>
        </div>
        {run ? (
          <div className="wiki-ingest-run__facts" aria-label="Ingest run facts">
            <span>{labelFor(run.status)}</span>
            <span>{run.affectedPageIds?.length || 0} pages touched</span>
            <span>{formatDateTime(run.completedAt || run.startedAt)}</span>
          </div>
        ) : null}
      </section>
      {loading ? <p className="wiki-index__status">Loading ingest run...</p> : null}
      {error ? <p className="wiki-index__error" role="alert">{error}</p> : null}
      {status ? <p className="wiki-index__status" role="status">{status}</p> : null}
      {!loading && !error && run?.suggestedCreatePage ? (
        <section className="wiki-ingest-run__suggestion" aria-label="Suggested wiki page">
          <div>
            <p className="wiki-index__eyebrow">No matching pages</p>
            <h2>{run.suggestedCreatePage.title}</h2>
            <p>Create a source page from this ingest so the wiki has somewhere to attach future maintenance.</p>
          </div>
          <button type="button" onClick={handleCreatePage} disabled={acting}>
            Create wiki page
          </button>
        </section>
      ) : null}
      {!loading && !error && run?.affectedPageIds?.length > 0 && !run?.undoneAt ? (
        <section className="wiki-ingest-run__undo" aria-label="Undo ingest">
          <div>
            <p className="wiki-index__eyebrow">Reversible changes</p>
            <h2>Undo this ingest</h2>
            <p>Restore affected pages to their snapshots from before this source was applied.</p>
          </div>
          <button type="button" onClick={handleUndo} disabled={acting}>
            Undo ingest
          </button>
        </section>
      ) : null}
      {!loading && !error ? (
        <ol className="wiki-activity-log__list wiki-ingest-run__timeline" aria-label="Ingest timeline">
          {timeline.map(item => (
            <li key={item.id || `${item.type}-${item.at}`} className={`wiki-activity-log__item is-${item.type || 'event'}`}>
              <div>
                <span>{labelFor(item.type)} · {labelFor(item.status)}</span>
                <h3>{labelFor(item.title || 'Activity')}</h3>
                {item.summary ? <p>{item.summary}</p> : null}
                <time dateTime={item.at}>{formatDateTime(item.at)}</time>
              </div>
              {item.pageId ? <Link to={`/wiki/${item.pageId}`}>Open page</Link> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {!loading && !error && timeline.length === 0 ? <p className="wiki-inbox__empty">No timeline events yet.</p> : null}
    </main>
  );
};

export default WikiIngestRun;
