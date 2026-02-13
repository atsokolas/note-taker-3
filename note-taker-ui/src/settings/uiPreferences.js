export const UI_SETTINGS_STORAGE_KEY = 'ui-settings.v1';

export const ACCENT_OPTIONS = [
  { value: 'blue', label: 'Blue', color: '#0b74ff', soft: 'rgba(11, 116, 255, 0.14)' },
  { value: 'emerald', label: 'Emerald', color: '#0f9f6e', soft: 'rgba(15, 159, 110, 0.16)' },
  { value: 'amber', label: 'Amber', color: '#d97706', soft: 'rgba(217, 119, 6, 0.16)' },
  { value: 'rose', label: 'Rose', color: '#be185d', soft: 'rgba(190, 24, 93, 0.14)' }
];

const ACCENT_BY_VALUE = ACCENT_OPTIONS.reduce((accumulator, accent) => {
  accumulator[accent.value] = accent;
  return accumulator;
}, {});

export const DEFAULT_UI_SETTINGS = {
  typographyScale: 'default',
  density: 'comfortable',
  theme: 'light',
  accent: 'blue'
};

const TYPOGRAPHY_VALUES = new Set(['small', 'default', 'large']);
const DENSITY_VALUES = new Set(['comfortable', 'compact']);
const THEME_VALUES = new Set(['light', 'dark']);
const ACCENT_VALUES = new Set(ACCENT_OPTIONS.map(option => option.value));

const normalizeOption = (value, allowedValues, fallbackValue) => {
  const candidate = String(value || '').trim().toLowerCase();
  if (allowedValues.has(candidate)) return candidate;
  return fallbackValue;
};

export const normalizeUiSettings = (input = {}) => ({
  typographyScale: normalizeOption(input.typographyScale, TYPOGRAPHY_VALUES, DEFAULT_UI_SETTINGS.typographyScale),
  density: normalizeOption(input.density, DENSITY_VALUES, DEFAULT_UI_SETTINGS.density),
  theme: normalizeOption(input.theme, THEME_VALUES, DEFAULT_UI_SETTINGS.theme),
  accent: normalizeOption(input.accent, ACCENT_VALUES, DEFAULT_UI_SETTINGS.accent)
});

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

export const applyUiSettingsToRoot = (root, settings) => {
  if (!root) return normalizeUiSettings(settings);
  const normalized = normalizeUiSettings(settings);
  const accent = ACCENT_BY_VALUE[normalized.accent] || ACCENT_BY_VALUE[DEFAULT_UI_SETTINGS.accent];

  root.setAttribute('data-ui-theme', normalized.theme);
  root.setAttribute('data-ui-density', normalized.density);
  root.setAttribute('data-ui-typography', normalized.typographyScale);
  root.style.setProperty('--ui-accent', accent.color);
  root.style.setProperty('--ui-accent-soft', accent.soft);

  return normalized;
};

export const getAccentOption = (accent) => {
  const normalized = normalizeOption(accent, ACCENT_VALUES, DEFAULT_UI_SETTINGS.accent);
  return ACCENT_BY_VALUE[normalized];
};
