import { THEME_OPTIONS } from './uiPreferences';

export const APPEARANCE_FIELD_KEYS = Object.freeze([
  'typographyScale',
  'density',
  'theme',
  'motion'
]);

export const appearanceFieldLabel = {
  typographyScale: 'Reading size',
  density: 'List spacing',
  theme: 'Appearance',
  motion: 'Motion'
};

const valueLabels = {
  typographyScale: { small: 'Small', default: 'Standard', large: 'Large' },
  density: { comfortable: 'Comfortable', compact: 'Compact' },
  theme: Object.fromEntries(THEME_OPTIONS.map(({ value, label }) => [value, label])),
  motion: { system: 'Follow device', reduced: 'Less motion' }
};

export const formatAppearanceValue = (key, value) => {
  return valueLabels[key]?.[value] ?? String(value ?? '');
};

const appearanceDiffKeys = (before, after) => APPEARANCE_FIELD_KEYS.filter(
  (key) => before?.[key] !== after?.[key]
);

export const pickAppearancePatch = (base, draft) => {
  const patch = {};
  appearanceDiffKeys(base, draft).forEach((key) => {
    patch[key] = draft[key];
  });
  return patch;
};

