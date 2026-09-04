import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getArticles } from '../../api/articles';
import { getFolders } from '../../api/folders';
import { buildDrift, driftSentence, isDriftCloseDay } from '../../pages/readingDriftModel';

/*
 * The drift's fortnightly column: the sentence, not the surface.
 *
 * Home stays atop Judgment, where the chart lives; the paper prints one
 * sentence on the morning the bucket closes and nothing the other thirteen.
 * The fetch only happens on that morning, after the paper is on screen and
 * never blocking it — a morning that opens without its sentence is a morning
 * missing one line, not a morning that waited. Below the minimum it stays
 * silent, however interesting the shape. It never takes the pulse: it
 * reports, it asks nothing.
 */

const WikiDriftSentence = ({ driftClosesAt = null, now = Date.now() }) => {
  const close = isDriftCloseDay({ driftClosesAt, now });
  const [sentence, setSentence] = useState('');
  useEffect(() => {
    if (!close) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [rows, folders] = await Promise.all([
          getArticles(),
          /* The cabinet, so a nested leaf reads as its drawer. A cabinet we
             could not read leaves exact leaves — coarser, never wrong. */
          Promise.resolve().then(() => getFolders()).catch(() => [])
        ]);
        if (cancelled) return;
        setSentence(driftSentence(buildDrift(
          Array.isArray(rows) ? rows : [],
          now,
          Array.isArray(folders) ? folders : []
        )));
      } catch (_unreadable) {
        // A drift we could not read is not a still drift. Say nothing.
        if (!cancelled) setSentence('');
      }
    })();
    return () => { cancelled = true; };
  }, [close, driftClosesAt, now]);
  if (!close || !sentence) return null;
  return (
    <section className="wfp-drift noeis-meander" aria-label="Reading drift">
      <p className="wiki-index__eyebrow">The drift</p>
      <p className="wfp-drift__sentence">
        {sentence} <Link to="/judgment">How your reading moved →</Link>
      </p>
    </section>
  );
};

export default WikiDriftSentence;
