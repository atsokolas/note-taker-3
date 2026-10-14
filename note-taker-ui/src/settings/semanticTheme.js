import { THEME_CATALOG } from './themeCatalog';

export const NOEIS_THEME_SCHEMA_VERSION = 1;
export const NOEIS_THEME_PACKAGE_ID = 'theme.editorial';

export const NOEIS_THEME_VARIANTS = Object.freeze(Object.fromEntries(
  THEME_CATALOG.map(({ id, label, scheme, family }) => [id, Object.freeze({
    id: `${NOEIS_THEME_PACKAGE_ID}.${id}`,
    label,
    colorScheme: scheme,
    family
  })])
));

export const colorSchemeForTheme = (activeTheme) => (
  NOEIS_THEME_VARIANTS[activeTheme]?.colorScheme === 'dark' ? 'dark' : 'light'
);

const DENSITIES = new Set(['comfortable', 'compact']);
const TYPOGRAPHY_SCALES = new Set(['small', 'default', 'large']);

export const buildSemanticThemeSnapshot = ({
  activeTheme,
  preferredTheme,
  density,
  typographyScale
} = {}) => {
  const variant = NOEIS_THEME_VARIANTS[activeTheme];
  if (!variant || !DENSITIES.has(density) || !TYPOGRAPHY_SCALES.has(typographyScale)) return null;

  return Object.freeze({
    schemaVersion: NOEIS_THEME_SCHEMA_VERSION,
    packageId: NOEIS_THEME_PACKAGE_ID,
    variantId: variant.id,
    activeTheme,
    preferredTheme,
    density,
    typographyScale
  });
};

/* One attribute names the theme; the rest describe it. Browsers do not paint
   between these synchronous writes, so the whole look changes at once, and an
   invalid snapshot leaves the last good theme untouched. */
export const applySemanticThemeSnapshot = (root, snapshot) => {
  if (!root || !snapshot || snapshot.schemaVersion !== NOEIS_THEME_SCHEMA_VERSION) return false;
  if (!NOEIS_THEME_VARIANTS[snapshot.activeTheme] || snapshot.variantId !== NOEIS_THEME_VARIANTS[snapshot.activeTheme].id) {
    return false;
  }

  root.setAttribute('data-ui-theme', snapshot.activeTheme);
  root.setAttribute('data-ui-scheme', NOEIS_THEME_VARIANTS[snapshot.activeTheme].colorScheme);
  root.setAttribute('data-ui-family', NOEIS_THEME_VARIANTS[snapshot.activeTheme].family);
  root.setAttribute('data-ui-theme-pref', snapshot.preferredTheme);
  root.setAttribute('data-ui-density', snapshot.density);
  root.setAttribute('data-ui-typography', snapshot.typographyScale);
  return true;
};
