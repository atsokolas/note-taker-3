import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveSourceDoors } from '../../utils/sourceRoutes';
import { formatClaimBornAt } from '../../utils/claimBornAt';

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
 *  - support: 'supported' | 'partial' | 'unsupported' | 'conflicted'
 *  - sources: resolved source objects (already filtered to citationIndexes)
 *  - onClose: () => void
 */

const SUPPORT_LABEL = {
  unknown: 'Unknown support',
  supported: 'Supported',
  partial: 'Partial support',
  unsupported: 'No source',
  contradicted: 'Contradicted',
  conflicted: 'Conflicted'
};

const SUPPORT_BLURB = {
  unknown: 'The support for this claim has not been recorded.',
  supported: 'This claim is grounded in your library.',
  partial: 'The recorded evidence supports only part of this claim.',
  unsupported: 'The agent wrote this without an attached source.',
  contradicted: 'A source in your library contradicts this claim.',
  conflicted: 'A source in your library conflicts with this claim.'
};

const EMPTY_SOURCES = [];
const POPOVER_WIDTH = 360;
const POPOVER_GAP = 10;

const formatDate = (value) => {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatConfidence = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  return `${Math.round(number * 100)}% confidence`;
};

const SourceTitle = ({ source, doors }) => {
  const title = source.title || 'Untitled source';
  if (doors.ownedHref) {
    return doors.isLibrary ? (
      <Link className="wiki-claim-popover__item-title" to={doors.ownedHref}>{title}</Link>
    ) : (
      <a className="wiki-claim-popover__item-title" href={doors.ownedHref}>{title}</a>
    );
  }
  return <span className="wiki-claim-popover__item-title">{title}</span>;
};

const SourceDoors = ({ doors }) => {
  if (!doors.openHref) return null;
  return (
    <div className="wiki-claim-popover__item-doors">
      {doors.ownedHref ? (
        doors.isLibrary ? (
          <Link className="wiki-claim-popover__item-link" to={doors.ownedHref}>
            Open in Library →
          </Link>
        ) : (
          <a className="wiki-claim-popover__item-link" href={doors.ownedHref}>
            Return to source →
          </a>
        )
      ) : null}
      {doors.originalHref ? (
        <a
          className={`wiki-claim-popover__item-link${doors.ownedHref ? ' wiki-claim-popover__item-link--secondary' : ''}`}
          href={doors.originalHref}
          target="_blank"
          rel="noreferrer"
        >
          Open original ↗
        </a>
      ) : null}
    </div>
  );
};

const EvidenceList = ({ title, sources, role }) => {
  if (!sources.length) return null;
  return (
    <section className={`wiki-claim-popover__evidence wiki-claim-popover__evidence--${role}`}>
      <h3 className="wiki-claim-popover__evidence-title">{title}</h3>
      <ol className="wiki-claim-popover__list">
        {sources.map((source, index) => {
          const doors = resolveSourceDoors(source);
          return (
            <li key={source._id || `${source.type}-${index}`} className="wiki-claim-popover__item">
              <div className="wiki-claim-popover__item-head">
                <span className="wiki-claim-popover__item-index">[{source.citationIndex || index + 1}]</span>
                <SourceTitle source={source} doors={doors} />
              </div>
              {source.snippet ? (
                <p className="wiki-claim-popover__item-snippet">{source.snippet}</p>
              ) : null}
              <SourceDoors doors={doors} />
            </li>
          );
        })}
      </ol>
    </section>
  );
};

const ClaimCitationPopover = ({ anchorRect, anchorElement, support, sources = EMPTY_SOURCES, claim, onClose, onCarry, carrying, carryError }) => {
  const popoverRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const width = Math.min(POPOVER_WIDTH, Math.max(0, viewport.width - 24));
  const maxHeight = Math.max(0, viewport.height - 24);
  const close = (restoreFocus = false) => {
    onClose?.({ restoreFocus });
    if (restoreFocus && anchorElement?.isConnected) anchorElement.focus({ preventScroll: true });
  };
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    // Keyboard activation enters the evidence; pointer hover keeps reading still.
    if (anchorElement && document.activeElement === anchorElement) popoverRef.current?.focus({ preventScroll: true });
  }, [anchorElement, anchorRect]);
  const confidence = formatConfidence(claim?.confidence);
  const verified = formatDate(claim?.lastVerifiedAt);
  const born = formatClaimBornAt(claim);
  const historyCount = Array.isArray(claim?.history) ? claim.history.length : 0;
  const supportingSources = sources.filter(source => source.evidenceRole !== 'contradicts');
  const contradictingSources = sources.filter(source => source.evidenceRole === 'contradicts');

  useLayoutEffect(() => {
    if (!anchorRect) return;
    const node = popoverRef.current;
    const popoverHeight = node ? node.offsetHeight : 160;
    const rect = anchorElement?.isConnected ? anchorElement.getBoundingClientRect() : anchorRect;
    const height = Math.min(popoverHeight, maxHeight);
    const wantsAbove = rect.top - height - POPOVER_GAP > 12;
    const desiredTop = wantsAbove ? rect.top - height - POPOVER_GAP : rect.bottom + POPOVER_GAP;
    const top = Math.max(12, Math.min(viewport.height - height - 12, desiredTop));
    const idealLeft = rect.left + rect.width / 2 - width / 2;
    const left = Math.max(12, Math.min(viewport.width - width - 12, idealLeft));
    setPosition({ top, left, side: wantsAbove ? 'above' : 'below' });
  }, [anchorRect, anchorElement, width, maxHeight, viewport, sources, claim]);

  useEffect(() => {
    if (!onClose) return undefined;
    const handlePointer = (event) => {
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return;
      onClose();
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose({ restoreFocus: true });
        if (anchorElement?.isConnected) anchorElement.focus({ preventScroll: true });
      }
    };
    const handleScroll = (event) => {
      // Don't dismiss when the scroll originates inside the popover (e.g.
      // the user is scrolling its citation list). Only outside-page scrolls
      // should close.
      if (event.target instanceof Node && popoverRef.current?.contains(event.target)) return;
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
  }, [onClose, anchorElement]);

  if (!anchorRect) return null;

  return (
    <div
      ref={popoverRef}
      className={`wiki-claim-popover wiki-claim-popover--${position?.side || 'above'} wiki-claim-popover--${support}`}
      tabIndex={-1}
      role="dialog"
      aria-label="Claim citations"
      style={{
        position: 'fixed',
        top: position ? `${position.top}px` : '-9999px',
        left: position ? `${position.left}px` : '-9999px',
        width: `${width}px`,
        maxHeight: `${maxHeight}px`,
        boxSizing: 'border-box',
        overflowY: 'auto',
        overflowWrap: 'anywhere',
        zIndex: 60
      }}
    >
      <button type="button" className="wiki-claim-popover__close" onClick={() => close(true)} aria-label="Close claim citations">Close</button>
      <div className="wiki-claim-popover__head">
        <span className={`wiki-claim-popover__pill wiki-claim-popover__pill--${support}`}>
          {SUPPORT_LABEL[support] || SUPPORT_LABEL.unknown}
        </span>
        <span className="wiki-claim-popover__count">
          {sources.length} source{sources.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="wiki-claim-popover__blurb">{SUPPORT_BLURB[support] || SUPPORT_BLURB.unknown}</p>
      {claim ? (
        <dl className="wiki-claim-popover__ledger" aria-label="Claim ledger">
          {born ? (
            <div>
              <dt>Born</dt>
              <dd>{born}</dd>
            </div>
          ) : null}
          {confidence ? (
            <div>
              <dt>Confidence</dt>
              <dd>{confidence}</dd>
            </div>
          ) : null}
          {verified ? (
            <div>
              <dt>Verified</dt>
              <dd>{verified}</dd>
            </div>
          ) : null}
          {claim.section ? (
            <div>
              <dt>Section</dt>
              <dd>{claim.section}</dd>
            </div>
          ) : null}
          {claim.epistemicStatus ? (
            <div>
              <dt>Epistemic status</dt>
              <dd>{String(claim.epistemicStatus).replace(/_/g, ' ')}</dd>
            </div>
          ) : null}
          {claim.materiality ? (
            <div>
              <dt>Materiality</dt>
              <dd>{claim.materiality}</dd>
            </div>
          ) : null}
          {historyCount ? (
            <div>
              <dt>Ledger</dt>
              <dd>{historyCount} event{historyCount === 1 ? '' : 's'}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {claim?.epistemicStatus === 'established_fact' && ['unsupported', 'conflicted'].includes(claim?.support) ? (
        <p className="wiki-claim-popover__empty">Inconsistent: this is labeled an established fact without supporting evidence.</p>
      ) : null}
      {sources.length > 0 ? (
        <div className="wiki-claim-popover__evidence-groups">
          <EvidenceList title={SUPPORT_LABEL[support] && support !== 'unknown' ? 'Supporting sources' : 'Attached sources'} sources={supportingSources} role="supports" />
          <EvidenceList title="Contradicting sources" sources={contradictingSources} role="contradicts" />
        </div>
      ) : (
        <p className="wiki-claim-popover__empty">
          No source attached. Add one from the panel to ground this claim.
        </p>
      )}
      {/* Where the library disagrees with itself, the only useful next move is
          to decide what you think. Without this the disagreement was a colour
          on a number and a heading in the article, and nothing followed it. */}
      {onCarry ? (
        <div className="wiki-claim-popover__door">
          <button
            type="button"
            className="wiki-claim-popover__carry"
            onClick={onCarry}
            disabled={Boolean(carrying)}
          >
            {carrying ? 'Carrying it over…' : 'Take this into a judgment →'}
          </button>
          {carryError ? (
            <p className="wiki-claim-popover__carry-error" role="alert">{carryError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default ClaimCitationPopover;
