/*
 * The Omarchy theme wears the desktop's own colours. Omarchy's theme-set hook
 * sends them in the link it opens Noeis with:
 *
 *   https://www.noeis.io/#omarchy-colors&background=1a1b26&foreground=a9b1d6&accent=7aa2f7&color1=f7768e&color2=9ece6a&color3=e0af68
 *
 * They are this machine's, so they stay on this device and are never synced:
 * choosing "Omarchy" is the setting, the colours are the desktop's. A device
 * that never received any wears Omarchy's default (Tokyo Night) from the
 * fallbacks in semantic-theme.css.
 */
export const OMARCHY_COLORS_STORAGE_KEY = 'omarchy-colors.v1';
export const OMARCHY_COLOR_KEYS = ['background', 'foreground', 'accent', 'color1', 'color2', 'color3'];

const hex = (value) => {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value || '').trim());
  return match ? `#${match[1].toLowerCase()}` : '';
};

const known = (input = {}) => Object.fromEntries(
  OMARCHY_COLOR_KEYS.map((key) => [key, hex(input[key])]).filter(([, value]) => value)
);

/* Light or dark, read off the paper once, when the colours arrive, so the
   first-paint script in index.html can set it without doing the arithmetic. */
const schemeOf = (background) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(background.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? 'light' : 'dark';
};

export const colorsFromHash = (hash) => {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (!params.has('omarchy-colors')) return null;
  const colors = known(Object.fromEntries(params));
  return colors.background ? { ...colors, scheme: schemeOf(colors.background) } : null;
};

export const loadOmarchyColors = (storage = window.localStorage) => {
  try {
    const saved = JSON.parse(storage.getItem(OMARCHY_COLORS_STORAGE_KEY) || '{}');
    return { ...known(saved), scheme: saved.scheme === 'light' ? 'light' : 'dark' };
  } catch (_error) {
    return { scheme: 'dark' };
  }
};

/* Keep what the link brought and take it out of the address bar. */
export const takeOmarchyColors = (location = window.location, history = window.history, storage = window.localStorage) => {
  const colors = colorsFromHash(location.hash);
  if (!colors) return;
  try {
    storage.setItem(OMARCHY_COLORS_STORAGE_KEY, JSON.stringify(colors));
  } catch (_error) {
    // A browser that cannot remember wears Omarchy's default instead.
  }
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
};

export const applyOmarchyColors = (root, colors) => {
  OMARCHY_COLOR_KEYS.forEach((key) => {
    if (colors[key]) root.style.setProperty(`--omarchy-${key}`, colors[key]);
    else root.style.removeProperty(`--omarchy-${key}`);
  });
};
