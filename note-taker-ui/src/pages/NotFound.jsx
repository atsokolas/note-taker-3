import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/not-found.css';

// A page that is not here says so.
//
// It used to redirect to the marketing home, which told you the page was fine
// and you were somewhere else — the worst of both, because a mistyped URL and
// a real page you had lost looked identical, and neither looked like an error.

const NotFound = () => {
  const location = useLocation();
  return (
    <main className="not-found" aria-labelledby="not-found-title">
      <h1 className="not-found__title" id="not-found-title">There is no page here.</h1>
      <p className="not-found__path">
        Nothing is published at <code>{location.pathname}</code>.
      </p>
      <p className="not-found__links">
        <Link to="/">Go to the front page</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/guides">Read the guides</Link>
      </p>
    </main>
  );
};

export default NotFound;
