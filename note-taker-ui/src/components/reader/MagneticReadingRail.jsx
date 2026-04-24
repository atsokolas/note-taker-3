import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import useCssMagneticLerp from '../../hooks/useCssMagneticLerp';
import { useFinePointer, usePrefersReducedMotion } from '../../hooks/useMotionPreferences';

const clamp01 = (n) => Math.max(0, Math.min(1, n));

const MagneticReadingRail = ({
  rootRef,
  contentRef,
  enabled = true
}) => {
  const progressRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const finePointer = useFinePointer();
  const magnet = useCssMagneticLerp('--magnetic-x', 0.2);

  const motionOk = enabled && !reducedMotion && finePointer;

  const updateProgress = useCallback(() => {
    const content = contentRef?.current;
    const bar = progressRef.current;
    if (!content || !bar) return;
    const rect = content.getBoundingClientRect();
    const vh = window.innerHeight || 0;
    const total = rect.height + vh * 0.35;
    const seen = clamp01((vh - rect.top) / Math.max(total, 1));
    bar.style.setProperty('--reading-progress', String(seen));
  }, [contentRef]);

  const handlePointerMove = useCallback((event) => {
    if (!motionOk) return;
    const root = rootRef?.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    if (
      event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom
    ) {
      magnet.setTarget(0);
      return;
    }
    const centerX = rect.left + rect.width / 2;
    const maxDrift = Math.min(56, rect.width * 0.12);
    const raw = event.clientX - centerX;
    const drift = Math.max(-maxDrift, Math.min(maxDrift, raw * 0.35));
    magnet.setTarget(drift);
  }, [motionOk, rootRef, magnet]);

  const handlePointerLeave = useCallback(() => {
    magnet.setTarget(0);
  }, [magnet]);

  useEffect(() => {
    if (!motionOk) {
      magnet.reset(0);
      return undefined;
    }
    const root = rootRef?.current;
    if (!root) return undefined;
    root.addEventListener('pointermove', handlePointerMove, { passive: true });
    root.addEventListener('pointerleave', handlePointerLeave);
    return () => {
      root.removeEventListener('pointermove', handlePointerMove);
      root.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [motionOk, rootRef, handlePointerMove, handlePointerLeave, magnet]);

  useEffect(() => {
    const root = rootRef?.current;
    if (!root) return undefined;
    const syncLayout = () => {
      const rect = root.getBoundingClientRect();
      root.style.setProperty('--magnetic-rail-left', `${Math.max(0, rect.left)}px`);
      root.style.setProperty('--magnetic-rail-width', `${rect.width}px`);
      updateProgress();
    };
    syncLayout();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncLayout) : null;
    if (ro) ro.observe(root);
    window.addEventListener('scroll', syncLayout, { passive: true, capture: true });
    window.addEventListener('resize', syncLayout);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('scroll', syncLayout, true);
      window.removeEventListener('resize', syncLayout);
    };
  }, [rootRef, updateProgress]);

  const scrollTop = useCallback(() => {
    const content = contentRef?.current;
    if (!content) return;
    const top = content.getBoundingClientRect().top + window.scrollY - 24;
    window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [contentRef, reducedMotion]);

  const railClass = useMemo(() => (
    ['magnetic-reading-rail', motionOk ? 'is-motion' : ''].filter(Boolean).join(' ')
  ), [motionOk]);

  return (
    <div className={railClass} aria-hidden={motionOk ? undefined : 'true'}>
      <div className="magnetic-reading-rail__track" ref={progressRef}>
        <div className="magnetic-reading-rail__fill" />
      </div>
      <div className="magnetic-reading-rail__pill-outer">
        <div className="magnetic-reading-rail__pill" ref={magnet.elRef}>
          <button
            type="button"
            className="magnetic-reading-rail__btn"
            onClick={scrollTop}
          >
            Top
          </button>
          <span className="magnetic-reading-rail__hint">Reading</span>
        </div>
      </div>
    </div>
  );
};

export default MagneticReadingRail;
