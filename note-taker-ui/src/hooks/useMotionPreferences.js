import { useEffect, useState } from 'react';

const mediaQueryMatches = (query, fallback = false) => {
  if (typeof window === 'undefined' || !window.matchMedia) return fallback;
  return Boolean(window.matchMedia(query).matches);
};

export const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(() => mediaQueryMatches('(prefers-reduced-motion: reduce)'));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(Boolean(mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return reduced;
};

export const useFinePointer = () => {
  const [fine, setFine] = useState(() => mediaQueryMatches('(pointer: fine)', true));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(pointer: fine)');
    const apply = () => setFine(Boolean(mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return fine;
};
