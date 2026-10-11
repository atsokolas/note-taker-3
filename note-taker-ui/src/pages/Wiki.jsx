import React, { Suspense, lazy } from 'react';
import '../styles/wiki-critical.css';
import '../styles/wiki-workspace-column.css';

const WikiWorkspace = lazy(() => import('../components/wiki/WikiWorkspace'));

/* /wiki/workspace. Reading lives at /wiki/read/:id and the front page at /wiki. */
const Wiki = () => (
  <Suspense fallback={<main className="wiki-page"><p className="wiki-index__status">Opening the workspace…</p></main>}>
    <WikiWorkspace />
  </Suspense>
);

export default Wiki;
