import React from 'react';
import { Link } from 'react-router-dom';
import {
  feedPlaces,
  KEPT_HREF,
  LATER_HREF,
  SET_ASIDE_HREF
} from '../../pages/libraryPlacesModel';
import { placeDoorLabel } from '../../pages/paperEditions';
import '../../styles/library-column.css';

/*
 * Later, Set aside, Kept, and whatever you screened.
 *
 * The count sits on the door. A sentence under the doors said the same
 * thing twice, in words nobody uses. Empty destinations stay named so they
 * can be found; they do not wear a nought.
 */

const LibraryPlaces = ({ feedTopics = [], later = null, setAside = null, kept = null, scope = '' }) => {
  const topics = feedPlaces(feedTopics);

  const door = (href, label, at) => (
    <Link to={href} className={scope === at ? 'is-here' : undefined} aria-current={scope === at ? 'page' : undefined}>
      {label}
    </Link>
  );

  return (
    <nav className="library-places" aria-label="Library places">
      <span className="library-places__doors">
        {door(LATER_HREF, placeDoorLabel('Later', later), 'later')}
        {door(SET_ASIDE_HREF, placeDoorLabel('Set aside', setAside), 'set-aside')}
        {door(KEPT_HREF, placeDoorLabel('Kept', kept), 'kept')}
        {topics.map((topic) => (
          <Link key={topic.id} className="is-living" to={topic.href}>{topic.name}</Link>
        ))}
      </span>
    </nav>
  );
};

export default LibraryPlaces;
