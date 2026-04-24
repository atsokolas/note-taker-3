import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * Smoothly drives a CSS length variable on an element toward a target (magnetic feel).
 * Updates via rAF; avoids React re-renders per frame.
 */
const useCssMagneticLerp = (propertyName = '--magnetic-x', factor = 0.22) => {
  const elRef = useRef(null);
  const current = useRef(0);
  const target = useRef(0);
  const rafId = useRef(0);

  const flush = useCallback(() => {
    const el = elRef.current;
    if (!el) {
      rafId.current = 0;
      return;
    }
    const c = current.current;
    const t = target.current;
    const delta = t - c;
    if (Math.abs(delta) < 0.35) {
      current.current = t;
      el.style.setProperty(propertyName, `${t}px`);
      rafId.current = 0;
      return;
    }
    current.current = c + delta * factor;
    el.style.setProperty(propertyName, `${current.current}px`);
    rafId.current = window.requestAnimationFrame(flush);
  }, [factor, propertyName]);

  const setTarget = useCallback((next) => {
    target.current = next;
    if (!rafId.current) {
      rafId.current = window.requestAnimationFrame(flush);
    }
  }, [flush]);

  const reset = useCallback((value = 0) => {
    current.current = value;
    target.current = value;
    if (rafId.current) {
      window.cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    }
    elRef.current?.style.setProperty(propertyName, `${value}px`);
  }, [propertyName]);

  useEffect(() => () => {
    if (rafId.current) window.cancelAnimationFrame(rafId.current);
  }, []);

  return useMemo(() => ({ elRef, setTarget, reset }), [setTarget, reset]);
};

export default useCssMagneticLerp;
