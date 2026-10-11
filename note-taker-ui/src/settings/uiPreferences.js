import { applySemanticThemeSnapshot, buildSemanticThemeSnapshot } from './semanticTheme';

export const UI_SETTINGS_STORAGE_KEY = 'ui-settings.v1';

export const DEFAULT_UI_SETTINGS = {
  typographyScale: 'default',
  density: 'comfortable',
  theme: 'auto',
  motion: 'system'
};

const TYPOGRAPHY_VALUES = new Set(['small', 'default', 'large']);
const DENSITY_VALUES = new Set(['comfortable', 'compact']);
const MOTION_VALUES = new Set(['system', 'reduced']);

// 'auto' tracks the OS. Light and Dark stay explicit. Tokyo Midnight is an
// explicit night theme and does not follow prefers-color-scheme.
// Unknown stored values fall back to auto; existing light/dark values stay.
export const THEME_VALUES = new Set(['auto', 'light', 'dark', 'tokyo-midnight']);
export const THEME_OPTIONS = [
  { value: 'auto', label: 'System', shortLabel: 'System' },
  { value: 'light', label: 'Light', shortLabel: 'Light' },
  { value: 'dark', label: 'Dark', shortLabel: 'Dark' },
  { value: 'tokyo-midnight', label: 'Tokyo Midnight', shortLabel: 'Midnight' }
];

export const MOTION_OPTIONS = [
  { value: 'system', label: 'Follow device' },
  { value: 'reduced', label: 'Less motion' }
];

const normalizeOption = (value, allowedValues, fallbackValue) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (allowedValues.has(candidate)) return candidate;
  return fallbackValue;
};

export const normalizeUiSettings = (input = {}) => ({
  typographyScale: normalizeOption(input.typographyScale, TYPOGRAPHY_VALUES, DEFAULT_UI_SETTINGS.typographyScale),
  density: normalizeOption(input.density, DENSITY_VALUES, DEFAULT_UI_SETTINGS.density),
  theme: normalizeOption(input.theme, THEME_VALUES, DEFAULT_UI_SETTINGS.theme),
  motion: normalizeOption(input.motion, MOTION_VALUES, DEFAULT_UI_SETTINGS.motion)
});

export const effectiveReducedMotion = (motionPreference, mediaQuery) => {
  const pref = normalizeOption(motionPreference, MOTION_VALUES, DEFAULT_UI_SETTINGS.motion);
  if (pref === 'reduced') return true;
  if (mediaQuery && typeof mediaQuery.matches === 'boolean') return mediaQuery.matches;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
};

export const persistUiSettingsToStorage = (settings, storage = window.localStorage) => {
  try {
    storage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeUiSettings(settings)));
  } catch (error) {
    console.warn('Unable to persist UI settings:', error?.message || error);
  }
};

export const loadUiSettingsFromStorage = (storage = window.localStorage) => {
  try {
    const raw = storage.getItem(UI_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_SETTINGS };
    return normalizeUiSettings(JSON.parse(raw));
  } catch (error) {
    return { ...DEFAULT_UI_SETTINGS };
  }
};

/**
 * resolveActiveTheme — given the user's preference, resolve the concrete
 * theme attribute that should land on <html>. 'auto' tracks the OS via the
 * standard prefers-color-scheme media query.
 */
export const resolveActiveTheme = (preferredTheme, mediaQuery) => {
  const pref = THEME_VALUES.has(preferredTheme) ? preferredTheme : DEFAULT_UI_SETTINGS.theme;
  if (pref !== 'auto') return pref;
  // auto: defer to OS. Tests can pass a stub mediaQuery.
  if (mediaQuery && typeof mediaQuery.matches === 'boolean') {
    return mediaQuery.matches ? 'dark' : 'light';
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
};

export const applyUiSettingsToRoot = (root, settings) => {
  if (!root) return normalizeUiSettings(settings);
  const normalized = normalizeUiSettings(settings);
  const activeTheme = resolveActiveTheme(normalized.theme);

  applySemanticThemeSnapshot(root, buildSemanticThemeSnapshot({
    activeTheme,
    preferredTheme: normalized.theme,
    density: normalized.density,
    typographyScale: normalized.typographyScale
  }));

  const reducedMotion = effectiveReducedMotion(normalized.motion);
  root.setAttribute('data-ui-motion', reducedMotion ? 'reduced' : 'system');
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('noeis-reduced-motion', reducedMotion);
  }

  return normalized;
};
