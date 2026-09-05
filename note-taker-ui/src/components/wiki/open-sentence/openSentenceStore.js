const PREFIX = 'noeis.open-sentence.';
const STORYBOARD_PREFIX = 'noeis.open-sentence.storyboard.';

const bagFor = (key) => {
  if (typeof window === 'undefined') return null;
  try {
    return String(key).startsWith(STORYBOARD_PREFIX)
      ? window.sessionStorage
      : window.localStorage;
  } catch (_blocked) {
    return null;
  }
};

export const readStore = (key) => {
  const bag = bagFor(key);
  if (!bag) return '';
  try {
    const held = bag.getItem(key) || '';
    if (held) return held;
    if (bag === window.localStorage) {
      const leftover = window.sessionStorage.getItem(key) || '';
      if (!leftover) return '';
      bag.setItem(key, leftover);
      window.sessionStorage.removeItem(key);
      return leftover;
    }
    return '';
  } catch (_blocked) {
    return '';
  }
};

export const writeStore = (key, value) => {
  const bag = bagFor(key);
  if (!bag) return;
  try {
    if (!value) bag.removeItem(key);
    else bag.setItem(key, value);
  } catch (_blocked) {
    /* device-save is best-effort */
  }
};

export const listenOpenSentenceStore = (onChange) => {
  if (typeof window === 'undefined' || typeof onChange !== 'function') return () => {};
  const onStore = (event) => {
    if (event.key && !String(event.key).startsWith(PREFIX)) return;
    onChange(event);
  };
  window.addEventListener('storage', onStore);
  return () => window.removeEventListener('storage', onStore);
};
