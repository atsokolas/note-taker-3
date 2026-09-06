import { useEffect, useState } from 'react';

const mediaQueryMatches = (query, fallback = false) => {
  if (typeof window === 'undefined' || !window.matchMedia) return fallback;
  return Boolean(window.matchMedia(query).matches);
};

const subscribeMedia = (mq, apply) => {
  if (!mq) return undefined;
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }
  if (typeof mq.addListener === 'function') {
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }
  return undefined;
};

const useMediaQuery = (query, fallback = false) => {
  const [matches, setMatches] = useState(() => mediaQueryMatches(query, fallback));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const apply = () => setMatches(Boolean(mq.matches));
    apply();
    return subscribeMedia(mq, apply);
  }, [query]);

  return matches;
};

export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

export const useFinePointer = () => useMediaQuery('(pointer: fine)', true);
