import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getArticles } from '../api/articles';
import { listWikiPages, listWikiSourceEvents } from '../api/wiki';
import { briefOpening, buildWeeklyBrief } from './weeklyBriefModel';
import { takeFirstPaint } from '../motion/columnMotion';
import '../styles/judgment.css';

/*
 * The week.
 *
 * A summary of what the surfaces already showed, gathered so you can read it
 * on a Friday and be done. It is not the only place any of this appears — the
 * judgment index carries its own marks — because a signal that lives solely in
 * a weekly digest becomes email you ignore.
 *
 * It counts. It does not exhort, it never says how many things you owe, and on
 * a quiet week it says the week was quiet. A brief that manufactures urgency
 * to justify its own existence is worse than no brief.
 */

const Section = ({ title, note, rows }) => {
  if (!rows.length) return null;
  return (
    <section className="brief__section">
      <h2>{title}</h2>
      {note ? <p className="brief__section-note">{note}</p> : null}
      <ul>
        {rows.map(row => (
          <li key={row.id}>
            <Link to={`/judgment/${row.id}`}>{row.claim}</Link>
            {row.note ? <span className="brief__row-note">{row.note}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
};

const WeeklyBrief = () => {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const arriving = useMemo(() => takeFirstPaint('weekly-brief'), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pages, articles, events] = await Promise.all([
          listWikiPages({ summary: 1, limit: 500 }),
          getArticles().catch(() => []),
          listWikiSourceEvents({ limit: 400 }).catch(() => [])
        ]);
        if (!cancelled) setBrief(buildWeeklyBrief({ pages, articles, events }));
      } catch (_loadError) {
        if (!cancelled) setError('Could not put this week together.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : '');

  return (
    <main className="judgment brief" aria-labelledby="brief-title">
      <div className={`judgment__meta ${step(1)}`}>
        <Link className="judgment__back" to="/judgment">← All judgments</Link>
      </div>
      <h1 className="brief__title" id="brief-title">Your week</h1>

      {loading ? <p className="judgment__quiet" role="status">Putting the week together…</p> : null}
      {error ? <p className="judgment__error" role="alert">{error}</p> : null}

      {brief ? (
        <div className={`brief__body ${step(2)}`}>
          <p className="brief__opening">{briefOpening(brief)}</p>

          {/* Only this one asks anything, and it asks quietly. */}
          <Section
            title="Waiting on you"
            note="Evidence arrived about these and has sat unread."
            rows={brief.avoided}
          />
          <Section title="Working" rows={brief.working} />
          {/* The heading already says it; repeating it on every row is the
              product talking to itself. */}
          <Section
            title="Nothing could check these"
            note="No falsifier written down, so no source could ever settle them."
            rows={brief.unfalsifiable.map(row => ({ ...row, note: '' }))}
          />

          {brief.learned.length ? (
            <section className="brief__section brief__learned">
              <h2>What you learned</h2>
              <ul>
                {brief.learned.map(lesson => (
                  <li key={lesson.id}>
                    <span>{lesson.text}</span>
                    <Link to={`/judgment/${lesson.pageId}`}>{lesson.claim}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Quiet is not listed. A claim nothing has arrived for is not
              something to report, and printing it would turn the brief into
              the backlog it exists to replace. */}
          {brief.quiet.length ? (
            <p className="brief__quiet-note">
              {brief.quiet.length} other{brief.quiet.length === 1 ? '' : 's'} sat quiet, which is not a problem.
            </p>
          ) : null}

          {brief.kept ? (
            <p className="brief__kept">
              <Link to="/evergreen">{brief.kept} thing{brief.kept === 1 ? '' : 's'} you keep for good →</Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </main>
  );
};

export default WeeklyBrief;
