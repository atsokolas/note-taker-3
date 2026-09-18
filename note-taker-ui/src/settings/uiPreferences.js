import { applySemanticThemeSnapshot, buildSemanticThemeSnapshot } from './semanticTheme';

export const UI_SETTINGS_STORAGE_KEY = 'ui-settings.v1';

export const ACCENT_OPTIONS = [
  { value: 'electric', label: 'Electric Cyan', color: '#36e4ff', soft: 'rgba(54, 228, 255, 0.22)' },
  { value: 'violet', label: 'Ion Violet', color: '#9d84ff', soft: 'rgba(157, 132, 255, 0.22)' },
  { value: 'indigo', label: 'Arc Indigo', color: '#6f87ff', soft: 'rgba(111, 135, 255, 0.2)' }
];

const ACCENT_BY_VALUE = ACCENT_OPTIONS.reduce((accumulator, accent) => {
  accumulator[accent.value] = accent;
  return accumulator;
}, {});

export const DEFAULT_UI_SETTINGS = {
  typographyScale: 'default',
  density: 'comfortable',
  theme: 'auto',
  accent: 'electric',
  brandEnergy: true,
  motion: 'system'
};

const TYPOGRAPHY_VALUES = new Set(['small', 'default', 'large']);
const DENSITY_VALUES = new Set(['comfortable', 'compact']);
const MOTION_VALUES = new Set(['system', 'reduced']);

// Theme accepts three real values now. 'auto' tracks OS via prefers-color-
// scheme so a user who never opens settings still gets the right look.
// Persisted values from before this PR ('dark') still normalize cleanly.
export const THEME_VALUES = new Set(['auto', 'light', 'dark']);
export const THEME_OPTIONS = [
  { value: 'auto', label: 'System', shortLabel: 'System' },
  { value: 'light', label: 'Light', shortLabel: 'Light' },
  { value: 'dark', label: 'Dark', shortLabel: 'Dark' }
];

export const MOTION_OPTIONS = [
  { value: 'system', label: 'Follow device' },
  { value: 'reduced', label: 'Less motion' }
];

const ACCENT_VALUES = new Set(ACCENT_OPTIONS.map(option => option.value));

const normalizeOption = (value, allowedValues, fallbackValue) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (allowedValues.has(candidate)) return candidate;
  return fallbackValue;
};

const normalizeBoolean = (value, fallbackValue = true) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return fallbackValue;
};

const LEGACY_ACCENT_MAP = {
  blue: 'electric',
  emerald: 'electric',
  amber: 'indigo',
  rose: 'violet'
};

const normalizeAccent = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (ACCENT_VALUES.has(candidate)) return candidate;
  if (LEGACY_ACCENT_MAP[candidate]) return LEGACY_ACCENT_MAP[candidate];
  return DEFAULT_UI_SETTINGS.accent;
};

export const normalizeUiSettings = (input = {}) => ({
  typographyScale: normalizeOption(input.typographyScale, TYPOGRAPHY_VALUES, DEFAULT_UI_SETTINGS.typographyScale),
  density: normalizeOption(input.density, DENSITY_VALUES, DEFAULT_UI_SETTINGS.density),
  theme: normalizeOption(input.theme, THEME_VALUES, DEFAULT_UI_SETTINGS.theme),
  accent: normalizeAccent(input.accent),
  brandEnergy: normalizeBoolean(input.brandEnergy, DEFAULT_UI_SETTINGS.brandEnergy),
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
  if (pref === 'light' || pref === 'dark') return pref;
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
  const accent = ACCENT_BY_VALUE[normalized.accent] || ACCENT_BY_VALUE[DEFAULT_UI_SETTINGS.accent];
  const activeTheme = resolveActiveTheme(normalized.theme);

  applySemanticThemeSnapshot(root, buildSemanticThemeSnapshot({
    activeTheme,
    preferredTheme: normalized.theme,
    density: normalized.density,
    typographyScale: normalized.typographyScale,
    brandEnergy: normalized.brandEnergy,
    accent
  }));

  const reducedMotion = effectiveReducedMotion(normalized.motion);
  root.setAttribute('data-ui-motion', reducedMotion ? 'reduced' : 'system');
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('noeis-reduced-motion', reducedMotion);
  }

  return normalized;
};

export const getAccentOption = (accent) => {
  const normalized = normalizeOption(accent, ACCENT_VALUES, DEFAULT_UI_SETTINGS.accent);
  return ACCENT_BY_VALUE[normalized];
};
