import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/not-found.css';

// A page that is not here says so, as a page torn out of the book: a
// mistyped address and a lost page should both look like what they are.
const NotFound = () => {
  const location = useLocation();
  return (
    <main className="not-found" aria-labelledby="not-found-title">
      <div className="not-found__page">
        <h1 className="not-found__title" id="not-found-title">This page has been torn out.</h1>
        <p className="not-found__path">
          All that is left at <code>{location.pathname}</code> is the stub.
        </p>
      </div>
      <p className="not-found__links">
        <Link to="/">Go to the front page</Link>
        <span aria-hidden="true"> · </span>
        <Link to="/guides">Read the guides</Link>
      </p>
    </main>
  );
};

export default NotFound;
