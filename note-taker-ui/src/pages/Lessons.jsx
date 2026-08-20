import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listWikiPages } from '../api/wiki';
import { buildLessonsIndex, formatLedgerDate } from './judgmentModel';
import { takeFirstPaint } from '../motion/columnMotion';
import '../styles/judgment.css';

/*
 * What your beliefs taught you.
 *
 * A claim is a position and it can be wrong. A lesson is what you learned from
 * holding it, and it stays true whichever way the claim went — so it is the
 * part of this product that compounds. This page is deliberately the shortest
 * thing in Noeis: sentences you wrote, oldest still legible, each still naming
 * the claim it came out of.
 *
 * Nothing here can be edited. A lesson you later find embarrassing is exactly
 * the one worth keeping.
 */

const CLOSED_AS_LABEL = {
  parked: 'when you parked it',
  closed: 'when you closed it',
  retired: 'when you retired it',
  revised: 'when you revised it'
};

const Lessons = () => {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const arriving = useMemo(() => takeFirstPaint('lessons'), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pages = await listWikiPages({ summary: 1, limit: 500 });
        if (!cancelled) setLessons(buildLessonsIndex(pages));
      } catch (_loadError) {
        if (!cancelled) setError('Could not load your lessons.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : '');

  return (
    <main className="judgment lessons" aria-labelledby="lessons-title">
      <div className={`judgment__meta ${step(1)}`}>
        <Link className="judgment__back" to="/judgment">← All judgments</Link>
      </div>
      <h1 className="lessons__title" id="lessons-title">What it taught me</h1>
      <p className={`lessons__dek ${step(2)}`}>
        A claim can turn out wrong. What holding it taught you stays true either way.
      </p>

      {loading ? <p className="judgment__quiet" role="status">Reading back through them…</p> : null}
      {error ? <p className="judgment__error" role="alert">{error}</p> : null}

      {!loading && !error && !lessons.length ? (
        <p className={`lessons__empty ${step(3)}`}>
          Nothing yet. A lesson gets written when you park or close a judgment —{' '}
          <Link to="/judgment">go and see what you are still holding</Link>.
        </p>
      ) : null}

      {lessons.length ? (
        <ol className={`lessons__list ${step(3)}`}>
          {lessons.map(lesson => (
            <li key={lesson.id} className="lessons__item">
              <p className="lessons__text">{lesson.text}</p>
              <p className="lessons__origin">
                <Link to={`/judgment/${lesson.pageId}`}>{lesson.claim}</Link>
                {CLOSED_AS_LABEL[lesson.closedAs] ? (
                  <span> · {CLOSED_AS_LABEL[lesson.closedAs]}</span>
                ) : null}
                {formatLedgerDate(lesson.at) ? <span> · {formatLedgerDate(lesson.at)}</span> : null}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </main>
  );
};

export default Lessons;
