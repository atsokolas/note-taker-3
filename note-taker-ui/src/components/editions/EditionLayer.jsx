import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEditionHeld } from '../../api/editions';
import AgentMark from './AgentMark';

/**
 * The reader's layer of a finding: the numbers that carry it, the words in
 * the source it rests on, and what you already hold that it touches. All are
 * optional, and a finding without them reads exactly as it always did.
 */

/* Up to three numbers, set large, each with what it counts. */
export function Figures({ figures = [] }) {
  if (!figures.length) return null;
  return (
    <dl className="reading-figures">
      {figures.map(({ label, value }) => (
        <div key={`${label}:${value}`}>
          <dd>{value}</dd>
          <dt>{label}</dt>
        </div>
      ))}
    </dl>
  );
}

/**
 * The passage a finding rests on. Only a passage found word for word in the
 * source is set as a quotation; one not yet checked says so, and one the
 * source does not contain says that, which is worth knowing before you keep it.
 */
export function Passage({ item }) {
  if (!item.passage) return null;
  const by = item.filedBy ? <AgentMark runtime={item.filedByRuntime} label={item.filedBy} /> : 'The agent';
  if (item.passageCheck === 'found') {
    return (
      <figure className="reading-passage">
        <blockquote>{item.passage}</blockquote>
        <figcaption>In the source, checked word for word</figcaption>
      </figure>
    );
  }
  return (
    <p className={`reading-passage-note reading-passage-note--${item.passageCheck}`}>
      {by}{' '}
      {item.passageCheck === 'missing'
        ? 'quoted a passage the source does not contain. Read the finding with that in mind.'
        : 'quoted a passage. It is checked against the source when you keep it.'}
    </p>
  );
}

/**
 * What you already hold that a finding touches: one highlight of yours, when
 * one clears the server's bar, asked for only once the finding is in focus.
 * Nothing qualifies, or the search could not run: nothing is said.
 */
export function Held({ editionId, itemId }) {
  const [held, setHeld] = useState(null);
  useEffect(() => {
    let active = true;
    getEditionHeld(editionId, itemId)
      .then(({ held: found }) => { if (active) setHeld(found); })
      .catch(() => {});
    return () => { active = false; };
  }, [editionId, itemId]);
  if (!held) return null;
  return (
    <p className="reading-held">
      <span>You already hold</span>
      <Link to={`/articles/${encodeURIComponent(held.articleId)}`}>“{held.text}”</Link>
      {held.articleTitle ? <small>{held.articleTitle}</small> : null}
    </p>
  );
}
