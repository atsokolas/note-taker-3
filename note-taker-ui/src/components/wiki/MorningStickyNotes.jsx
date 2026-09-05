import React from 'react';
import { Link } from 'react-router-dom';

/*
 * Pinned lines whose morning has come. Dated stickies print once and go
 * home; undated ones never leave the object they are pinned to, so if this
 * section is on the paper, every line in it has a morning — that is the
 * only reason it is here rather than on its object. At most three, oldest
 * promise first. It never takes the pulse: a nudge is not news.
 */

const MorningStickyNotes = ({ stickies }) => {
  const items = (Array.isArray(stickies) ? stickies : [])
    .filter((row) => row && String(row.text || '').trim());
  if (!items.length) return null;
  return (
    <section className="wiki-front-page__sticky-notes" aria-label="Pinned lines due">
      <ol className="wiki-front-page__sticky-notes-list">
        {items.map((row) => {
          const key = String(row.stickyId || row._id || row.text);
          const text = String(row.text || '').trim();
          const title = String(row.targetTitle || '').trim();
          const href = String(row.href || '').trim();
          return (
            <li key={key}>
              <span>{text}</span>
              {title && href ? (
                <>
                  {' — '}
                  <Link to={href}>{title}</Link>
                </>
              ) : title ? (
                <>
                  {' — '}
                  <span>{title}</span>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default MorningStickyNotes;
