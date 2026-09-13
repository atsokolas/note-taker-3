import { useEffect, useState } from 'react';
import { beatQuestionPresence, getQuestionPresence } from '../api/questions';

const PRESENCE_BEAT_MS = 20 * 1000;

const asHere = (value) => (
  Array.isArray(value)
    ? value
      .map((row) => ({ by: String(row?.by || '').trim() }))
      .filter((row) => row.by)
    : []
);

const seedKeyOf = (value) => asHere(value).map((row) => row.by).join('\0');

const hereFromKey = (value) => (
  String(value || '')
    .split('\0')
    .filter(Boolean)
    .map((by) => ({ by }))
);

export default function useQuestionPresence(slug, { enabled = true, seed = [] } = {}) {
  const key = String(slug || '').trim();
  const seedKey = seedKeyOf(seed);
  const [here, setHere] = useState(() => hereFromKey(seedKey));

  useEffect(() => {
    setHere(hereFromKey(seedKey));
  }, [key, seedKey]);

  useEffect(() => {
    if (!enabled || !key) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const signedIn = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('token'));
        const payload = signedIn
          ? await beatQuestionPresence(key)
          : await getQuestionPresence(key);
        if (!cancelled) setHere(asHere(payload?.here));
      } catch (_error) {
        /* keep the last known names */
      }
    };
    tick();
    const timer = window.setInterval(tick, PRESENCE_BEAT_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [key, enabled]);

  return here;
}
