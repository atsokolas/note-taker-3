import React from 'react';
import { Link } from 'react-router-dom';
import {
  feedPlaces,
  KEPT_HREF,
  LATER_HREF,
  SET_ASIDE_HREF
} from '../../pages/libraryPlacesModel';
import { deskClauses, firstMorningDeskLine, shelfClause } from '../../pages/paperEditions';
import '../../styles/library-column.css';

/*
 * The desk line.
 *
 * This was four links in a row: Later, Set aside, Kept, and whatever was
 * screened. Four links are a navigation bar — they say where you could go and
 * nothing about whether it is worth going. A sentence is a report:
 *
 *   On your desk — 3 owed a move, 1 at hand, Costco has 2 new folios.
 *   The shelf holds 7.
 *
 * Only places with something on them speak, the folder is named rather than
 * called a feed, and the shelf always gets its clause because the canon is the
 * one place that is never neglected. The words stay links, so the sentence is
 * still the way there.
 */

const LibraryPlaces = ({ feedTopics = [], later = null, setAside = null, kept = null, firstMorning = false, scope = '' }) => {
  const topics = feedPlaces(feedTopics);
  const clauses = firstMorning ? [] : deskClauses({
    later,
    setAside,
    topics: topics.map(topic => ({ id: topic.id, name: topic.name, open: topic.open, href: topic.href }))
  });
  const shelf = firstMorning ? null : shelfClause(kept);

  /* Empty is absent applies to the sentence, not to the doors. A desk with
     nothing on it says nothing — no row of noughts — but Later, Set aside and
     Kept stay where they are, because a place you cannot find is a place you
     do not have, and that is true whether or not anything is in it today. */
  /* The three places used to be listed twice: here, and again in the cabinet
     on the left among the folders. A place named in two registers on one
     screen is a reader asking which one is the real one — and the cabinet was
     the wrong answer, because Later, Set aside and Kept are not folders. They
     are where a source stands. So they live here, at the head of the room, at
     a size that says they are the way in. */
  const door = (href, label, at) => (
    <Link to={href} className={scope === at ? 'is-here' : undefined} aria-current={scope === at ? 'page' : undefined}>
      {label}
    </Link>
  );

  return (
    <nav className="library-places" aria-label="Library places">
      <span className="library-places__doors">
        {door(LATER_HREF, 'Later', 'later')}
        {door(SET_ASIDE_HREF, 'Set aside', 'set-aside')}
        {door(KEPT_HREF, 'Kept', 'kept')}
        {topics.map((topic) => (
          <Link key={topic.id} className="is-living" to={topic.href}>{topic.name}</Link>
        ))}
      </span>
      {firstMorning ? (
        <p className="library-places__line">{firstMorningDeskLine()}</p>
      ) : clauses.length || shelf ? (
        /* The report is the same sentence it always was; every count in it is
           now the way to the pile it counts. */
        <p className="library-places__line">
          {clauses.length ? (
            <>
              On your desk —{' '}
              {clauses.map((clause, index) => (
                <React.Fragment key={clause.key}>
                  {index ? ', ' : null}
                  {clause.href ? <Link to={clause.href}>{clause.text}</Link> : clause.text}
                </React.Fragment>
              ))}
              .{' '}
            </>
          ) : null}
          {shelf ? <><Link to={shelf.href}>{shelf.text}</Link>.</> : null}
        </p>
      ) : null}
    </nav>
  );
};

export default LibraryPlaces;
