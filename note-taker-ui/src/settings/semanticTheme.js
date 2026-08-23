export const NOEIS_THEME_SCHEMA_VERSION = 1;
export const NOEIS_THEME_PACKAGE_ID = 'theme.editorial';

export const NOEIS_THEME_VARIANTS = Object.freeze({
  light: Object.freeze({
    id: 'theme.editorial.light',
    label: 'Light editorial theme',
    colorScheme: 'light'
  }),
  dark: Object.freeze({
    id: 'theme.editorial.dark',
    label: 'Dark editorial theme',
    colorScheme: 'dark'
  })
});

const DENSITIES = new Set(['comfortable', 'compact']);
const TYPOGRAPHY_SCALES = new Set(['small', 'default', 'large']);

export const buildSemanticThemeSnapshot = ({
  activeTheme,
  preferredTheme,
  density,
  typographyScale,
  brandEnergy,
  accent
} = {}) => {
  const variant = NOEIS_THEME_VARIANTS[activeTheme];
  if (!variant || !DENSITIES.has(density) || !TYPOGRAPHY_SCALES.has(typographyScale)) return null;
  if (!accent?.color || !accent?.soft) return null;

  return Object.freeze({
    schemaVersion: NOEIS_THEME_SCHEMA_VERSION,
    packageId: NOEIS_THEME_PACKAGE_ID,
    variantId: variant.id,
    activeTheme,
    preferredTheme,
    density,
    typographyScale,
    brandEnergy: Boolean(brandEnergy),
    accent: Object.freeze({ color: accent.color, soft: accent.soft })
  });
};

/**
 * Apply compatibility attributes and inline preferences first, then commit the
 * canonical semantic-theme identity last. Browsers do not paint between these
 * synchronous mutations, so every shell-owned role changes as one package.
 * Invalid snapshots leave the last known-good theme untouched.
 */
export const applySemanticThemeSnapshot = (root, snapshot) => {
  if (!root || !snapshot || snapshot.schemaVersion !== NOEIS_THEME_SCHEMA_VERSION) return false;
  if (!NOEIS_THEME_VARIANTS[snapshot.activeTheme] || snapshot.variantId !== NOEIS_THEME_VARIANTS[snapshot.activeTheme].id) {
    return false;
  }

  root.setAttribute('data-ui-theme', snapshot.activeTheme);
  root.setAttribute('data-ui-theme-pref', snapshot.preferredTheme);
  root.setAttribute('data-ui-density', snapshot.density);
  root.setAttribute('data-ui-typography', snapshot.typographyScale);
  root.setAttribute('data-ui-brand-energy', snapshot.brandEnergy ? 'on' : 'off');
  root.style.setProperty('--ui-accent', snapshot.accent.color);
  root.style.setProperty('--ui-accent-soft', snapshot.accent.soft);
  root.setAttribute('data-noeis-theme-schema', String(snapshot.schemaVersion));
  root.setAttribute('data-noeis-theme-package', snapshot.packageId);
  root.setAttribute('data-noeis-theme', snapshot.variantId);
  return true;
};
