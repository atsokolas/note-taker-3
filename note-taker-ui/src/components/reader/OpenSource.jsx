import React, { useState } from 'react';
import { checkOriginalSource } from '../../api/articleReadingState';
import { originalUrl } from '../library/libraryColumnModel';

/* Open source, and what we know about the original. Pressing it asks the
   server to look (once a day at most); a 404 or 410 there, or on an earlier
   fetch, is the only thing that says the original is gone. */
export default function OpenSource({ article }) {
  const [goneAt, setGoneAt] = useState(article?.sourceGoneAt || null);
  const href = originalUrl(article);
  if (!href) return null;
  const look = () => {
    checkOriginalSource(article._id).then(setGoneAt).catch(() => {});
  };
  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={look}>Open source</a>
      {goneAt ? (
        <span className="article-source-gone" role="status">The original is gone. Your copy isn&rsquo;t.</span>
      ) : null}
    </>
  );
}
