import { useEffect, useRef, useState } from 'react';
import {
  getArticleReadingState,
  saveArticleReadingState
} from '../../api/articleReadingState';
import { canonicalArticleSnapshot } from '../../utils/articlePassageAnchor';
import {
  anchorForReadingNode,
  readingCandidates,
  resolveReadingPlace
} from './articleReadingPlace';

const keyOf = (place) => (place ? JSON.stringify(place.anchor) : '');

export default function useArticleReadingPlace({
  articleId,
  contentRef,
  contentKey,
  explicitDestination,
  enabled
}) {
  const [arrival, setArrival] = useState('');
  const explicit = useRef(explicitDestination);
  explicit.current = explicitDestination;
  useEffect(() => {
    setArrival('');
    if (!enabled || !articleId || !contentRef.current) return undefined;
    const root = contentRef.current;

    let active = true,
      armed = false,
      moved = false,
      timer,
      markerTimer,
      frame,
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
    getArticleReadingState(articleId)
      .then((place) => {
        if (!active || !place || moved || explicit.current) return;
        const found = resolveReadingPlace(root, place);
        if (!found) return;
        lastKey = keyOf(place);
        found.node.classList.add('is-reading-place');
        found.node.scrollIntoView?.({ block: 'start', behavior: 'instant' });
        baselineKey = keyOf({ anchor: anchorForReadingNode(root, found.node) });
        setArrival(
          found.exact
            ? 'Back where you left off'
            : 'Near your previous place — the passage changed'
        );
        markerTimer = window.setTimeout(() => {
          found.node.classList.remove('is-reading-place');
          setArrival('');
        }, 5000);
      })
      .catch(() => {});
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
      window.clearTimeout(markerTimer);
      window.cancelAnimationFrame(frame);
      readingCandidates(root).forEach((node) =>
        node.classList.remove('is-reading-place')
      );
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
  return {
    arrival,
    startAtTop: () => {
      contentRef.current?.scrollIntoView?.({
        block: 'start',
        behavior: 'instant'
      });
      setArrival('');
    }
  };
}
