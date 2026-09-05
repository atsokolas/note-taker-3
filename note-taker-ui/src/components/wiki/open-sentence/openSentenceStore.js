export const readStore = (key) => {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(key) || '';
  } catch (_blocked) {
    return '';
  }
};

export const writeStore = (key, value) => {
  if (typeof window === 'undefined') return;
  try {
    if (!value) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch (_blocked) {
    /* device-save is best-effort */
  }
};
