import React, { useCallback, useRef } from 'react';
import { sourceLinks } from '../../pages/editionModel';

/**
 * The sources, on the newsstand and on the full issue.
 *
 * Beside Share: a sentence a person would actually say. At the foot: the
 * same list, folded, until you ask to see every link. Nothing here is
 * invented — if the issue cites nothing followable, the control is absent.
 */

export const SOURCES_JUMP_COPY = 'Show me the sources';
export const SOURCES_LIST_COPY = 'The sources';

const instantMotion = () => (
  typeof window !== 'undefined'
  && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
);

export const useEditionSources = (edition) => {
  const sources = sourceLinks(edition);
  const listRef = useRef(null);
  const listId = `edition-sources-${edition?._id || 'issue'}`;
  const jump = useCallback(() => {
    listRef.current?.scrollIntoView?.({
      behavior: instantMotion() ? 'auto' : 'smooth',
      block: 'start'
    });
  }, []);
  return { sources, listId, listRef, jump };
};

export const EditionSourcesJump = ({ listId, onJump }) => (
  <button
    type="button"
    className="edition-sources-jump"
    data-testid="edition-sources-jump"
    aria-controls={listId}
    onClick={onJump}
  >
    {SOURCES_JUMP_COPY}
  </button>
);

export const EditionSourcesList = ({ sources, listId, listRef }) => (
  <details
    ref={listRef}
    id={listId}
    className="edition-sources"
    data-testid="edition-sources"
  >
    <summary className="edition-sources__summary">{SOURCES_LIST_COPY}</summary>
    <ul className="edition-sources__list">
      {sources.map(source => (
        <li key={source.href}>
          <a href={source.href} target="_blank" rel="noopener noreferrer">
            {source.label}
          </a>
        </li>
      ))}
    </ul>
  </details>
);
