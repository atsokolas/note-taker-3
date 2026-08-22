import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWeeklyMovements } from '../../api/knowledgeMovements';

/* The week in your thinking: a retrospective under the morning's paper.
   It counts what happened this week, grouped by the page it happened to.
   Standing states are the day's business and live upstream; when nothing
   happened, this section says nothing at all — an empty room on a full page
   is noise, not honesty. */

const formatRange = ({ weekStart, weekEnd }) => {
  try {
    const start = new Date(weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const end = new Date(weekEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${start} – ${end}`;
  } catch (_error) {
    return '';
  }
};

const WeeklyDigest = () => {
  const [digest, setDigest] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    // A test double that lost its implementation returns undefined; the
    // digest treats that the same as a quiet week, never as a crash.
    Promise.resolve(getWeeklyMovements())
      .then(data => {
        if (alive) setDigest(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed || !digest || digest.quiet || !(Array.isArray(digest.groups) && digest.groups.length)) {
    return null;
  }

  const range = formatRange(digest);

  return (
    <section className="wfp-week" aria-labelledby="wfp-week-title">
      <div className="wfp-week__head">
        <h2 className="wfp-week__title" id="wfp-week-title">The week in your thinking</h2>
        {range ? <p className="wfp-week__range">{range}</p> : null}
      </div>
      {digest.groups.map(group => (
        <article className="wfp-week__group" key={`${group.subject.type}:${group.subject.id}`}>
          <h3 className="wfp-week__page">
            <Link to={group.subject.href || '/wiki'}>{group.subject.title}</Link>
          </h3>
          <ul className="wfp-week__items">
            {(group.items || []).map((item, index) => (
              <li key={`${item.kind}:${item.occurredAt}:${index}`}>
                <span className="wfp-week__kind">{item.label}</span>
                {' — '}
                <Link to={item.href}>{item.title}</Link>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
};

export default WeeklyDigest;
