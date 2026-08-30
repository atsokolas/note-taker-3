import React, { useLayoutEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/useMotionPreferences';
import { prefersReducedMotion } from '../../motion/columnMotion';

const THREAD_LIFETIME_MS = 1400;
const REDUCED_LIFETIME_MS = 650;

const centerLeft = (rect) => ({
  x: rect.left - 10,
  y: rect.top + (rect.height / 2)
});

/* Ariadne is a receipt orientation cue, not another source of truth. The
   accepted sentences and receipt stay in the document; this one-shot thread
   merely shows where the reviewed correction landed after the write returns. */
const AriadneThread = ({ traceId = '', sourceRef, targetRef }) => {
  // The shared hook follows preference changes. The synchronous read prevents
  // a single animated paint before its first effect runs for reduced-motion users.
  const reducedMotion = usePrefersReducedMotion() || prefersReducedMotion();
  const [thread, setThread] = useState(null);

  useLayoutEffect(() => {
    if (!traceId) return undefined;
    const source = sourceRef?.current;
    const target = targetRef?.current?.querySelector?.('.judgment__opinion') || targetRef?.current;
    if (!source?.getBoundingClientRect || !target?.getBoundingClientRect) return undefined;

    const start = centerLeft(source.getBoundingClientRect());
    const end = centerLeft(target.getBoundingClientRect());
    if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return undefined;

    const bend = Math.max(36, Math.abs(end.x - start.x) * 0.42);
    setThread({
      end,
      path: `M ${start.x} ${start.y} C ${start.x - bend} ${start.y}, ${end.x + bend} ${end.y}, ${end.x} ${end.y}`,
      viewport: {
        width: Math.max(1, window.innerWidth),
        height: Math.max(1, window.innerHeight)
      }
    });

    const timer = window.setTimeout(
      () => setThread(null),
      reducedMotion ? REDUCED_LIFETIME_MS : THREAD_LIFETIME_MS
    );
    return () => window.clearTimeout(timer);
  }, [reducedMotion, sourceRef, targetRef, traceId]);

  if (!thread) return null;

  return (
    <span
      className={`ariadne-thread${reducedMotion ? ' ariadne-thread--reduced' : ''}`}
      data-testid="ariadne-thread"
      aria-hidden="true"
    >
      {!reducedMotion ? (
        <svg
          className="ariadne-thread__line"
          viewBox={`0 0 ${thread.viewport.width} ${thread.viewport.height}`}
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d={thread.path} pathLength="1" />
        </svg>
      ) : null}
      <span
        className="ariadne-thread__knot"
        style={{ left: `${thread.end.x}px`, top: `${thread.end.y}px` }}
      />
    </span>
  );
};

export default AriadneThread;
