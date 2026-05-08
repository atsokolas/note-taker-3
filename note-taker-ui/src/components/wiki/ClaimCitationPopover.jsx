import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * ClaimCitationPopover — Wikipedia-style footnote popover for an inline
 * claim. Resolves citationIndexes against the page's sourceRefs and shows
 * each source with title, snippet, and an "open" link.
 *
 * Behavior:
 *  - Lives at the document level (portal-style fixed positioning).
 *  - Anchors above the trigger element; flips below if it would clip the
 *    top of the viewport.
 *  - Closes on outside click, Escape, or scroll.
 *
 * Props:
 *  - anchorRect: DOMRect of the claim span being hovered
 *  - support: 'supported' | 'partial' | 'unsupported' | 'contradicted'
 *  - sources: resolved source objects (already filtered to citationIndexes)
 *  - onClose: () => void
 */

const SUPPORT_LABEL = {
  supported: 'Supported',
  partial: 'Partial support',
  unsupported: 'No source',
  contradicted: 'Contradicted'
};

const SUPPORT_BLURB = {
  supported: 'This claim is grounded in your library.',
  partial: 'Only one source partially supports this claim.',
  unsupported: 'The agent wrote this without an attached source.',
  contradicted: 'A source in your library contradicts this claim.'
};

const POPOVER_WIDTH = 360;
const POPOVER_GAP = 10;

const ClaimCitationPopover = ({ anchorRect, support, sources, onClose }) => {
  const popoverRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const node = popoverRef.current;
    const popoverHeight = node ? node.offsetHeight : 160;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const wantsAbove = anchorRect.top - popoverHeight - POPOVER_GAP > 12;
    const top = wantsAbove
      ? Math.max(12, anchorRect.top - popoverHeight - POPOVER_GAP)
      : Math.min(viewportH - popoverHeight - 12, anchorRect.bottom + POPOVER_GAP);
    const idealLeft = anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2;
    const left = Math.min(viewportW - POPOVER_WIDTH - 12, Math.max(12, idealLeft));
    setPosition({ top, left, side: wantsAbove ? 'above' : 'below' });
  }, [anchorRect]);

  useEffect(() => {
    if (!onClose) return undefined;
    const handlePointer = (event) => {
      if (popoverRef.current?.contains(event.target)) return;
      onClose();
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const handleScroll = (event) => {
      // Don't dismiss when the scroll originates inside the popover (e.g.
      // the user is scrolling its citation list). Only outside-page scrolls
      // should close.
      if (popoverRef.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener('mousedown', handlePointer);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  return (
    <div
      ref={popoverRef}
      className={`wiki-claim-popover wiki-claim-popover--${position?.side || 'above'} wiki-claim-popover--${support}`}
      role="dialog"
      aria-label="Claim citations"
      style={{
        position: 'fixed',
        top: position ? `${position.top}px` : '-9999px',
        left: position ? `${position.left}px` : '-9999px',
        width: `${POPOVER_WIDTH}px`,
        zIndex: 60
      }}
    >
      <div className="wiki-claim-popover__head">
        <span className={`wiki-claim-popover__pill wiki-claim-popover__pill--${support}`}>
          {SUPPORT_LABEL[support] || SUPPORT_LABEL.supported}
        </span>
        <span className="wiki-claim-popover__count">
          {sources.length} source{sources.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="wiki-claim-popover__blurb">{SUPPORT_BLURB[support] || SUPPORT_BLURB.supported}</p>
      {sources.length > 0 ? (
        <ol className="wiki-claim-popover__list">
          {sources.map((source, index) => (
            <li key={source._id || `${source.type}-${index}`} className="wiki-claim-popover__item">
              <div className="wiki-claim-popover__item-head">
                <span className="wiki-claim-popover__item-index">[{source.citationIndex || index + 1}]</span>
                <span className="wiki-claim-popover__item-title">{source.title || 'Untitled source'}</span>
              </div>
              {source.snippet ? (
                <p className="wiki-claim-popover__item-snippet">{source.snippet}</p>
              ) : null}
              {source.url ? (
                <a
                  className="wiki-claim-popover__item-link"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source ↗
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="wiki-claim-popover__empty">
          No source attached. Add one from the panel to ground this claim.
        </p>
      )}
    </div>
  );
};

export default ClaimCitationPopover;
