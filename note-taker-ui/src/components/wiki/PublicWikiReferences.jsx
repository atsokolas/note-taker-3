import React, { useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';

export const usePublicCitationReturn = (scope) => {
  const [previous, setPlace] = useState(null);
  const place = previous?.scope === scope ? previous : null;
  const reducedMotion = usePrefersReducedMotion();

  const openCitation = (event) => {
    const trigger = event.target.closest?.('.wiki-claim-citation');
    const id = trigger?.getAttribute('data-footnote-target');
    if (!/^wiki-ref-\d+$/.test(id || '')) return;
    const reference = event.currentTarget.querySelector(`[data-reference="${id}"]`);
    if (!reference) return;
    event.preventDefault();
    const hash = place?.hash ?? window.location.hash;
    if (reference.id) window.history.replaceState(window.history.state, '', `#${id}`);
    setPlace({ id, trigger, hash, scope });
    reference.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    reference.focus({ preventScroll: true });
  };

  const returnToClaim = () => {
    if (!place) return;
    const { trigger, hash } = place;
    if (window.location.hash !== hash) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
    }
    setPlace(null);
    trigger.focus({ preventScroll: true });
    trigger.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
  };

  return { openCitation, returnToClaim, activeRef: place?.id };
};

export default function PublicWikiReferences({ sources, citation, anchors = false }) {
  if (!Array.isArray(sources) || !sources.length) return null;
  return (
    <section className="shared-wiki-page__sources" aria-label="References">
      <h2>References</h2>
      <ol>
        {sources.map((source, index) => {
          const id = `wiki-ref-${index + 1}`;
          return (
            <li key={source._id || source.id || index} id={anchors ? id : undefined} data-reference={id} tabIndex={-1}>
              {source.url
                ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || source.url}</a>
                : <span>{source.title || source.type || 'Source'}</span>}
              {source.snippet ? <p>{source.snippet}</p> : null}
              {citation.activeRef === id ? (
                <button type="button" className="shared-wiki-page__citation-return" onClick={citation.returnToClaim}>
                  <span aria-hidden="true">← </span>Back to the cited line
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
