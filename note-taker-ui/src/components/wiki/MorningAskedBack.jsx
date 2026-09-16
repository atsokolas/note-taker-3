import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { updateReturnQueueEntry } from '../../api/returnQueue';
import { addDays, askedBackHref, askedBackLine, kairosSentence, KAIROS_EYEBROW, paperAskedBack } from '../../pages/kairosModel';

const MorningAskedBack = ({ askedBack, pulse = false }) => {
  const [gone, setGone] = useState(() => new Set());
  const [busy, setBusy] = useState('');
  const items = paperAskedBack(askedBack).filter((row) => !gone.has(String(row.queueId || row.articleId || row.questionId)));
  if (!items.length) return null;

  const snooze = async (item) => {
    const id = String(item.queueId || '');
    if (!id || busy) return;
    setBusy(id);
    try {
      await updateReturnQueueEntry(id, {
        action: 'reschedule',
        dueAt: addDays(new Date(), 7).toISOString()
      });
      setGone((current) => new Set(current).add(id));
    } catch (_error) {
      setBusy('');
      return;
    }
    setBusy('');
  };

  return (
    <section
      className={['wiki-front-page__asked-back', 'noeis-meander', pulse ? 'is-morning-pulse' : ''].filter(Boolean).join(' ')}
      aria-label="Asked back"
    >
      <p className="wiki-front-page__asked-back-eyebrow">{KAIROS_EYEBROW}</p>
      {/* A recurring promise on its second firing knows you have seen it.
          Saying "You asked for this back." every Tuesday for a year turns a
          kept promise into a notification. */}
      <p className="wiki-front-page__asked-back-sentence">
        {kairosSentence({
          fired: items[0]?.fired,
          recurring: Boolean(items[0]?.cadence)
        })}
      </p>
      <ol className="wiki-front-page__asked-back-list">
        {items.map((item) => {
          const line = askedBackLine(item);
          return (
            <li key={item.queueId || item.articleId || item.questionId}>
              <Link to={askedBackHref(item)}>
                {item.title}
              </Link>
              {line ? <p className="wiki-front-page__asked-back-line">{line}</p> : null}
              {item.queueId ? (
                <button
                  type="button"
                  className="wiki-front-page__asked-back-snooze"
                  disabled={busy === item.queueId}
                  onClick={() => snooze(item)}
                >
                  Next week
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default MorningAskedBack;
