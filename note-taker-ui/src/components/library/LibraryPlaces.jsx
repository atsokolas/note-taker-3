import React from 'react';
import { Link } from 'react-router-dom';
import {
  feedPlaces,
  KEPT_HREF,
  LATER_HREF,
  SET_ASIDE_HREF
} from '../../pages/libraryPlacesModel';
import { deskLine, firstMorningDeskLine } from '../../pages/paperEditions';
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
  const sentence = firstMorning
    ? firstMorningDeskLine()
    : deskLine({
      later,
      setAside,
      kept,
      topics: topics.map(topic => ({ name: topic.name, open: topic.open }))
    });

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
      {sentence ? <p className="library-places__line">{sentence}</p> : null}
    </nav>
  );
};

export default LibraryPlaces;
