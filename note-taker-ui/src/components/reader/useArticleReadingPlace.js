import { useEffect, useRef, useState } from 'react';
import {
  getArticleReadingState,
  saveArticleReadingState
} from '../../api/articleReadingState';
import { canonicalArticleSnapshot } from '../../utils/articlePassageAnchor';
import {
  anchorForReadingNode,
  readingCandidates,
  resolveReadingPlace,
  stoppedHereLine
} from './articleReadingPlace';

const keyOf = (place) => (place ? JSON.stringify(place.anchor) : '');
/* How long the line stays before it fades. The marks stay until you read on. */
const LINE_MS = 5000;

/* Where a place sits on the page decides whether it is worth returning to:
   on the first screen the page already opens there; on the last screen you
   finished the piece. Either way, no line. */
export const placeWorthReturning = (root, node) => {
  const top = node.getBoundingClientRect().top + window.scrollY;
  const end = root.getBoundingClientRect().bottom + window.scrollY;
  if (top < window.innerHeight) return false;
  const candidates = readingCandidates(root);
  if (candidates[candidates.length - 1] === node) return false;
  return end - top > window.innerHeight;
};

export default function useArticleReadingPlace({
  articleId,
  contentRef,
  contentKey,
  explicitDestination,
  enabled
}) {
  const explicit = useRef(explicitDestination);
  explicit.current = explicitDestination;
  /* What this open did with your place: 'pending' until it knows, 'shown'
     when it returned you there, 'explicit' when a link chose the passage,
     'none' otherwise. A return greeting waits for 'none'. */
  const [arrival, setArrival] = useState({ articleId, value: 'pending' });
  useEffect(() => {
    if (!enabled || !articleId || !contentRef.current) return undefined;
    const root = contentRef.current;
    const arrive = (value) => setArrival((current) => (
      current.articleId === articleId && current.value !== 'pending' ? current : { articleId, value }
    ));

    let active = true,
      armed = false,
      moved = false,
      timer,
      fade,
      frame,
      marked = [],
      lastKey = '',
      pending = null,
      inFlight = false;
    const visible = () =>
      readingCandidates(root).find((node) => {
        const rect = node.getBoundingClientRect();
        return (
          rect.height > 0 && rect.bottom > 140 && rect.top < window.innerHeight
        );
      });
    const initial = visible();
    let baselineKey = initial
      ? keyOf({ anchor: anchorForReadingNode(root, initial) })
      : '';
    let leftBaseline = false;
    const position = () => {
      const node = visible();
      if (!moved || !node) return null;
      const snapshot = canonicalArticleSnapshot(root);
      const anchor = anchorForReadingNode(root, node, snapshot);
      if (anchor && keyOf({ anchor }) !== baselineKey) leftBaseline = true;
      if (!leftBaseline) return null;
      return anchor
        ? {
            anchor,
            ratio:
              anchor.startOffsetApprox / Math.max(1, snapshot.fullText.length)
          }
        : null;
    };
    const persist = async (keepalive = false) => {
      const next = position();
      if (next) pending = next;
      if (!pending || keyOf(pending) === lastKey || inFlight) return;
      const place = pending;
      pending = null;
      inFlight = true;
      try {
        await saveArticleReadingState(articleId, place, { keepalive });
        lastKey = keyOf(place);
      } catch (_) {
        // A failed background write never interrupts reading. Retain for a
        // later settled movement, visibility flush, or a return to this tab.
        pending = pending || place;
      } finally {
        inFlight = false;
        if (pending && keyOf(pending) !== keyOf(place)) persist(!active);
      }
    };
    /* The marks say where you were until you start reading again. */
    const unmark = () => {
      window.clearTimeout(fade);
      marked.forEach((node) => {
        node.classList.remove('is-reading-place', 'is-reading-before', 'is-stopped-faded');
        delete node.dataset.stopped;
      });
      marked = [];
    };
    getArticleReadingState(articleId)
      .then((place) => {
        if (!active) return;
        if (explicit.current) return arrive('explicit');
        if (!place || moved) return arrive('none');
        const found = resolveReadingPlace(root, place);
        if (!found) return arrive('none');
        lastKey = keyOf(place);
        if (!placeWorthReturning(root, found.node)) return arrive('none');
        const candidates = readingCandidates(root);
        const before = candidates[candidates.indexOf(found.node) - 1];
        found.node.classList.add('is-reading-place');
        found.node.dataset.stopped = stoppedHereLine(place.visitedAt, { exact: found.exact });
        before?.classList.add('is-reading-before');
        marked = [found.node, before].filter(Boolean);
        found.node.scrollIntoView?.({ block: 'start', behavior: 'instant' });
        baselineKey = keyOf({ anchor: anchorForReadingNode(root, found.node) });
        fade = window.setTimeout(() => found.node.classList.add('is-stopped-faded'), LINE_MS);
        arrive('shown');
      })
      .catch(() => { if (active) arrive('none'); });
    const arm = (event) => {
      if (
        event.type === 'pointerdown' &&
        event.clientX < document.documentElement.clientWidth
      )
        return;
      if (
        event.type === 'keydown' &&
        ![
          'ArrowDown',
          'ArrowUp',
          'PageDown',
          'PageUp',
          'Home',
          'End',
          ' '
        ].includes(event.key)
      )
        return;
      if (
        event.target?.closest?.(
          'input, textarea, [contenteditable="true"], [role="dialog"]'
        )
      )
        return;
      armed = true;
    };
    const scroll = () => {
      if (!armed) return;
      moved = true;
      unmark();
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        pending = position() || pending;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => persist(), 1200);
      });
    };
    const hide = () => {
      if (document.visibilityState === 'hidden') persist(true);
    };
    const pagehide = () => persist(true);
    const resume = () => {
      if (document.visibilityState === 'visible' && pending) persist();
    };
    window.addEventListener('pointerdown', arm, { passive: true });
    window.addEventListener('wheel', arm, { passive: true });
    window.addEventListener('touchmove', arm, { passive: true });
    window.addEventListener('keydown', arm);
    window.addEventListener('scroll', scroll, { passive: true, capture: true });
    document.addEventListener('visibilitychange', hide);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pagehide', pagehide);
    return () => {
      persist(true);
      active = false;
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      unmark();
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('wheel', arm);
      window.removeEventListener('touchmove', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('pagehide', pagehide);
      document.removeEventListener('visibilitychange', hide);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [articleId, contentKey, contentRef, enabled]);
  return arrival.articleId === articleId ? arrival.value : 'pending';
}
