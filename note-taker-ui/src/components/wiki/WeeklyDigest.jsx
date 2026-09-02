import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWeeklyMovements } from '../../api/knowledgeMovements';
import { getArticles } from '../../api/articles';
import { listWikiPages, listWikiSourceEvents } from '../../api/wiki';
import { buildWeeklyBrief, paperWeekLine } from '../../pages/weeklyBriefModel';

/* The weekend edition.
 *
 * There were two weeklies. This one counted the corpus's movements under the
 * morning's paper; a separate page at /week said what the week did to your
 * thinking, and hung off one link at the foot of Judgment where nobody would
 * find it. Two weeklies on two clocks is one weekly and an orphan.
 *
 * They are one section now: what the corpus did, and what it did to you.
 * paperWeekLine was written for exactly this and had never been called —
 * it says only what the paper can actually see, which is what is waiting on
 * you and what you learned, and never invents a reading count.
 *
 * When nothing happened, the section says nothing at all. An empty room on a
 * full page is noise, not honesty. */

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
  const [weekLine, setWeekLine] = useState('');

  useEffect(() => {
    let alive = true;
    /* What the week did to your thinking. Read alongside the movements rather
       than on its own page: a reader should not have to go looking for the
       week. A failure here leaves the line absent and the movements intact. */
    Promise.allSettled([
      listWikiPages({ scope: 'all' }),
      getArticles(),
      listWikiSourceEvents({ windowDays: 7 })
    ]).then(([pages, articles, events]) => {
      if (!alive) return;
      const brief = buildWeeklyBrief({
        pages: pages.status === 'fulfilled' && Array.isArray(pages.value) ? pages.value : [],
        articles: articles.status === 'fulfilled' && Array.isArray(articles.value) ? articles.value : [],
        events: events.status === 'fulfilled' && Array.isArray(events.value) ? events.value : []
      });
      setWeekLine(paperWeekLine(brief));
    });
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
        <h2 className="wfp-week__title" id="wfp-week-title">The weekend</h2>
        {weekLine ? <p className="wfp-week__line">{weekLine}</p> : null}
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
