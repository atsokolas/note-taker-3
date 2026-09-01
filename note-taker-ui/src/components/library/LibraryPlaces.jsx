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

const LibraryPlaces = ({ feedTopics = [], later = null, setAside = null, kept = null, firstMorning = false }) => {
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
  return (
    <nav className="library-places" aria-label="Library places">
      {sentence ? <p className="library-places__line">{sentence}</p> : null}
      <span className="library-places__doors">
        <Link to={LATER_HREF}>Later</Link>
        <Link to={SET_ASIDE_HREF}>Set aside</Link>
        <Link to={KEPT_HREF}>Kept</Link>
        {topics.map((topic) => (
          <Link key={topic.id} className="is-living" to={topic.href}>{topic.name}</Link>
        ))}
      </span>
    </nav>
  );
};

export default LibraryPlaces;
