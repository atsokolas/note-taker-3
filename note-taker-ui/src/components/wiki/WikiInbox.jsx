import React, { useEffect, useState } from 'react';
import { Button } from '../ui';
import { listWikiSourceEvents, processPendingWikiSourceEvents, processWikiSourceEvent } from '../../api/wiki';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const WikiInbox = () => {
  const [events, setEvents] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [processingAll, setProcessingAll] = useState(false);
  const [error, setError] = useState('');

  const loadEvents = async () => {
    setError('');
    try {
      setEvents(await listWikiSourceEvents({ limit: 12 }));
    } catch (_error) {
      setError('Failed to load source inbox.');
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const processOne = async (eventId) => {
    setBusyId(eventId);
    setError('');
    try {
      await processWikiSourceEvent(eventId);
      await loadEvents();
    } catch (_error) {
      setError('Failed to process source event.');
    } finally {
      setBusyId('');
    }
  };

  const processPending = async () => {
    setProcessingAll(true);
    setError('');
    try {
      await processPendingWikiSourceEvents();
      await loadEvents();
    } catch (_error) {
      setError('Failed to process pending events.');
    } finally {
      setProcessingAll(false);
    }
  };

  const pendingCount = events.filter(event => event.status === 'pending' || event.status === 'failed').length;

  return (
    <section className="wiki-inbox" aria-label="Wiki source inbox">
      <div className="wiki-inbox__head">
        <div>
          <p className="wiki-inbox__eyebrow">Source inbox</p>
          <h2>New material affecting the wiki</h2>
        </div>
        <Button type="button" variant="secondary" onClick={processPending} disabled={!pendingCount || processingAll}>
          {processingAll ? 'Processing...' : `Process ${pendingCount || ''}`.trim()}
        </Button>
      </div>
      {error ? <p className="wiki-inbox__error" role="alert">{error}</p> : null}
      <ul className="wiki-inbox__list">
        {events.map(event => (
          <li key={event._id} className={`wiki-inbox__item wiki-inbox__item--${event.status || 'pending'}`}>
            <div>
              <span className="wiki-inbox__status">{event.status || 'pending'}</span>
              <h3>{event.title || 'Untitled source'}</h3>
              <p>{event.summary || `${event.provider || event.sourceType || 'source'} changed.`}</p>
              <span className="wiki-inbox__meta">{event.provider || event.sourceType} · {formatDate(event.createdAt)}</span>
            </div>
            {(event.status === 'pending' || event.status === 'failed') ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => processOne(event._id)}
                disabled={busyId === event._id}
              >
                {busyId === event._id ? 'Applying...' : 'Apply'}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {!events.length ? <p className="wiki-inbox__empty">No source events yet.</p> : null}
    </section>
  );
};

export default WikiInbox;
