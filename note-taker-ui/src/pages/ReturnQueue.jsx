import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageTitle, SectionHeader, QuietButton } from '../components/ui';
import { listReturnQueue, updateReturnQueueEntry } from '../api/returnQueue';

const formatDate = (value) => {
  if (!value) return 'No due date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Invalid date';
  return parsed.toLocaleString();
};

const isDueNow = (entry, now) => {
  if (entry.status !== 'pending') return false;
  if (!entry.dueAt) return true;
  const parsed = new Date(entry.dueAt);
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() <= now.getTime();
};

const isUpcoming = (entry, now) => {
  if (entry.status !== 'pending') return false;
  if (!entry.dueAt) return false;
  const parsed = new Date(entry.dueAt);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() > now.getTime();
};

const ReturnQueue = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingById, setSavingById] = useState({});

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listReturnQueue({ filter: 'all' });
      setEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load return queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const dueNow = useMemo(() => {
    const now = new Date();
    return entries.filter(entry => isDueNow(entry, now));
  }, [entries]);
  const upcoming = useMemo(() => {
    const now = new Date();
    return entries.filter(entry => isUpcoming(entry, now));
  }, [entries]);
  const completed = useMemo(
    () => entries.filter(entry => entry.status === 'completed').sort((a, b) => (
      new Date(b.completedAt || b.updatedAt || 0) - new Date(a.completedAt || a.updatedAt || 0)
    )),
    [entries]
  );

  const setSaving = (id, value) => {
    setSavingById(prev => ({ ...prev, [id]: value }));
  };

  const patchEntry = async (id, payload) => {
    setSaving(id, true);
    setError('');
    try {
      const updated = await updateReturnQueueEntry(id, payload);
      setEntries(prev => prev.map(entry => (entry._id === id ? updated : entry)));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update return queue entry.');
    } finally {
      setSaving(id, false);
    }
  };

  const openItem = (entry) => {
    const openPath = entry?.item?.openPath || '';
    if (!openPath) return;
    window.location.href = openPath;
  };

  const renderSection = (title, subtitle, items, showDoneAction = true) => (
    <div className="section-stack">
      <SectionHeader title={title} subtitle={subtitle} />
      {items.length === 0 ? (
        <p className="muted small">Nothing here.</p>
      ) : (
        <div className="return-queue-list">
          {items.map(entry => (
            <div key={entry._id} className="return-queue-row">
              <div className="return-queue-main">
                <div className="return-queue-title">{entry.item?.title || `${entry.itemType} item`}</div>
                <div className="return-queue-snippet">{entry.item?.snippet || entry.itemId}</div>
                <div className="return-queue-meta">
                  <span>{entry.itemType}</span>
                  <span>Due: {formatDate(entry.dueAt)}</span>
                  {entry.reason && <span>Reason: {entry.reason}</span>}
                </div>
              </div>
              <div className="return-queue-actions">
                <QuietButton onClick={() => openItem(entry)} disabled={!entry.item?.openPath}>
                  Open item
                </QuietButton>
                {showDoneAction && (
                  <QuietButton
                    onClick={() => patchEntry(entry._id, { action: 'done' })}
                    disabled={Boolean(savingById[entry._id])}
                  >
                    Done
                  </QuietButton>
                )}
                <QuietButton
                  onClick={() => patchEntry(entry._id, { action: 'snooze', snoozeDays: 3 })}
                  disabled={Boolean(savingById[entry._id])}
                >
                  Snooze 3d
                </QuietButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="section-stack">
      <PageTitle
        eyebrow="Queue"
        title="Return Queue"
        subtitle="Defer items and revisit them when they are due."
      />
      <div className="return-queue-toolbar">
        <QuietButton onClick={loadEntries} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </QuietButton>
      </div>
      {error && <p className="status-message error-message">{error}</p>}
      {renderSection('Due now', 'Items ready to revisit.', dueNow)}
      {renderSection('Upcoming', 'Scheduled for later.', upcoming)}
      {renderSection('Completed', 'Finished queue entries.', completed, false)}
    </div>
  );
};

export default ReturnQueue;
