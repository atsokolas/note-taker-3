import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getArticles } from '../api/articles';
import { listWikiPages } from '../api/wiki';
import { buildEvergreenIndex, evergreenHref, EVERGREEN_KIND_LABEL } from './evergreenModel';
import { formatSurfaceDate } from '../utils/dateDisplay';
import { takeFirstPaint } from '../motion/columnMotion';
import '../styles/evergreen.css';

/*
 * What you keep.
 *
 * Everywhere else this product is about change — what arrived overnight, what
 * has gone unread, what your reading is drifting toward. This page is the
 * opposite, and it exists because some reading is not like that. It is held
 * for life, and the only thing it asks of software is to still be there.
 *
 * Sources, pages, and beliefs together, because the reader does not keep them
 * in separate categories in their head. In the order they decided to keep
 * them, because a canon reads best in the order it was built.
 */

const Evergreen = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const arriving = useMemo(() => takeFirstPaint('evergreen'), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [articles, pages] = await Promise.all([
          getArticles().catch(() => []),
          listWikiPages({ summary: 1, limit: 500 }).catch(() => [])
        ]);
        if (!cancelled) setEntries(buildEvergreenIndex({ articles, pages }));
      } catch (_loadError) {
        if (!cancelled) setError('Could not read what you have kept.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const step = (n) => (arriving ? `wfp-anim wfp-anim--${n}` : '');

  return (
    <main className="evergreen" aria-labelledby="evergreen-title">
      <h1 className="evergreen__title" id="evergreen-title">What you keep</h1>
      <p className={`evergreen__dek ${step(1)}`}>
        Held for life, and never counted as neglected.
      </p>

      {loading ? <p className="evergreen__quiet" role="status">Reading back through them…</p> : null}
      {error ? <p className="evergreen__error" role="alert">{error}</p> : null}

      {!loading && !error && !entries.length ? (
        <p className={`evergreen__empty ${step(2)}`}>
          Nothing kept yet. When something is worth returning to for years rather than days,
          mark it <em>Keep this</em> — on a source in your <Link to="/library">library</Link>,
          on a wiki page, or on a <Link to="/judgment">belief you hold</Link>.
        </p>
      ) : null}

      {entries.length ? (
        <ol className={`evergreen__list ${step(2)}`}>
          {entries.map(entry => (
            <li key={entry.id} className="evergreen__item" data-kind={entry.kind}>
              <Link className="evergreen__link" to={evergreenHref(entry)}>{entry.title}</Link>
              <p className="evergreen__meta">
                <span>{EVERGREEN_KIND_LABEL[entry.kind]}</span>
                {entry.detail ? <span> · {entry.detail}</span> : null}
                {formatSurfaceDate(entry.keptAt, { includeYear: true })
                  ? <span> · kept {formatSurfaceDate(entry.keptAt, { includeYear: true })}</span>
                  : null}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </main>
  );
};

export default Evergreen;
