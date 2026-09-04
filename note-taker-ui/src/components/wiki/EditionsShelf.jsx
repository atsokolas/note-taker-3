import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listEditions } from '../../api/editions';
import { gapLine, windowLine } from '../../pages/editionModel';

/**
 * The door on the Paper to the papers your agents write.
 *
 * Editions are not a fifth room. The four rooms are what you did; an edition
 * is something that arrived, and things that arrive belong on the front page.
 *
 * When no agent has filed anything this says nothing at all. An empty shelf
 * announcing itself on the morning paper is noise, and the reader who has
 * never connected an agent is not failing at something.
 */
const EditionsShelf = () => {
  const [editions, setEditions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    listEditions({ limit: 3 })
      .then((found) => { if (!cancelled) setEditions(found); })
      .catch(() => { if (!cancelled) setEditions([]); });
    return () => { cancelled = true; };
  }, []);

  if (!editions.length) return null;

  return (
    <section className="paper-editions" aria-label="Editions">
      <h2 className="paper-editions__title">
        <Link to="/editions">Editions</Link>
      </h2>
      <ul className="paper-editions__list">
        {editions.map((edition) => {
          const gap = gapLine(edition);
          return (
            <li key={edition._id}>
              <Link to={`/editions/${edition._id}`}>
                <span className="paper-editions__name">{edition.title}</span>
                <span className="paper-editions__window">{windowLine(edition)}</span>
              </Link>
              {gap ? <span className="paper-editions__gap">{gap}</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default EditionsShelf;
