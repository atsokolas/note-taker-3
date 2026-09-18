import { DEFAULT_UI_SETTINGS } from './uiPreferences';

export const APPEARANCE_FIELD_KEYS = Object.freeze([
  'typographyScale',
  'density',
  'theme',
  'accent',
  'brandEnergy',
  'motion'
]);

export const appearanceFieldLabel = {
  typographyScale: 'Reading size',
  density: 'List spacing',
  theme: 'Appearance',
  accent: 'Accent',
  brandEnergy: 'Decorative color',
  motion: 'Motion'
};

const valueLabels = {
  typographyScale: { small: 'Small', default: 'Standard', large: 'Large' },
  density: { comfortable: 'Comfortable', compact: 'Compact' },
  theme: { auto: 'System', light: 'Light', dark: 'Dark' },
  accent: { electric: 'Cyan', violet: 'Violet', indigo: 'Indigo' },
  brandEnergy: { true: 'On', false: 'Off' },
  motion: { system: 'Follow device', reduced: 'Less motion' }
};

export const formatAppearanceValue = (key, value) => {
  if (key === 'brandEnergy') return valueLabels.brandEnergy[String(Boolean(value))];
  return valueLabels[key]?.[value] ?? String(value ?? '');
};

export const appearanceDiffKeys = (before, after) => APPEARANCE_FIELD_KEYS.filter(
  (key) => before?.[key] !== after?.[key]
);

export const pickAppearancePatch = (base, draft) => {
  const patch = {};
  appearanceDiffKeys(base, draft).forEach((key) => {
    patch[key] = draft[key];
  });
  return patch;
};

export const mergeRemoteIntoDraft = (draft, baseAtEditStart, remote) => {
  const next = { ...draft };
  APPEARANCE_FIELD_KEYS.forEach((key) => {
    const localChanged = draft[key] !== baseAtEditStart[key];
    const remoteChanged = remote[key] !== baseAtEditStart[key];
    if (!localChanged && remoteChanged) {
      next[key] = remote[key];
    }
  });
  return next;
};

export const conflictingAppearanceKeys = (draft, baseAtEditStart, remote) => APPEARANCE_FIELD_KEYS.filter(
  (key) => draft[key] !== baseAtEditStart[key] && remote[key] !== baseAtEditStart[key] && draft[key] !== remote[key]
);

export const appearanceDefaults = () => ({ ...DEFAULT_UI_SETTINGS });
