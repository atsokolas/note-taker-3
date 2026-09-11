import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// A view of the same document. Keep editors and their save sessions mounted.
export function useReadFresh(rootRef, scopeId, passageSelector) {
  const [view, setView] = useState(null);
  const position = useRef(null);
  const readFresh = Boolean(view?.fresh && view.scopeId === scopeId);

  useEffect(() => { setView(null); }, [scopeId]);

  useLayoutEffect(() => {
    const held = position.current;
    position.current = null;
    if (!held?.node.isConnected || held.scopeId !== scopeId) return;
    const delta = held.node.getBoundingClientRect().top - held.top;
    if (Math.abs(delta) < 1) return;
    held.scroller.scrollBy({ top: delta, behavior: 'instant' });
  }, [readFresh, scopeId]);

  const toggle = () => {
    const root = rootRef.current;
    const node = Array.from(root?.querySelectorAll(passageSelector) || []).find(element => {
      if (element.closest('.open-sentence__library-pocket, .open-sentence__reveal')) return false;
      const rect = element.getBoundingClientRect();
      return rect.height > 0 && rect.bottom > 96 && rect.top < window.innerHeight;
    });
    if (node) {
      let scroller = node.parentElement;
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
      position.current = { node, top: node.getBoundingClientRect().top, scroller: scroller || window, scopeId };
    }
    setView({ scopeId, fresh: !readFresh });
  };

  return { readFresh, toggle };
}

export default function ReadFresh({ readFresh, toggle }) {
  return <button type="button" className="read-fresh-toggle" aria-pressed={readFresh}
    title={readFresh ? 'Restore your annotations and writing.' : 'Hide your annotations temporarily. Source text and footnotes stay.'}
    onClick={toggle}>{readFresh ? 'Show my work' : 'Read fresh'}</button>;
}
