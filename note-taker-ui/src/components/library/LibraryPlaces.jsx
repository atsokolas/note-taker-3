import React from 'react';
import { Link } from 'react-router-dom';
import {
  feedPlaces,
  KEPT_HREF,
  LATER_HREF,
  SET_ASIDE_HREF
} from '../../pages/libraryPlacesModel';
import '../../styles/library-column.css';

/*
 * Temporary doors at the top of the paper and the Library column.
 * The weave can move them later; they have to be findable now.
 */

const LibraryPlaces = ({ feedTopics = [] }) => {
  const topics = feedPlaces(feedTopics);
  return (
    <nav className="library-places" aria-label="Library places">
      <Link to={LATER_HREF}>Later</Link>
      <Link to={SET_ASIDE_HREF}>Set aside</Link>
      <Link to={KEPT_HREF}>Kept</Link>
      {topics.map((topic) => (
        <Link key={topic.id} className="is-living" to={topic.href}>{topic.name}</Link>
      ))}
    </nav>
  );
};

export default LibraryPlaces;
