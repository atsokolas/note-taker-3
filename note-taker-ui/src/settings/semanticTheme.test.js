import {
  applySemanticThemeSnapshot,
  buildSemanticThemeSnapshot,
  NOEIS_THEME_PACKAGE_ID,
  NOEIS_THEME_SCHEMA_VERSION
} from './semanticTheme';

const validInput = {
  activeTheme: 'light',
  preferredTheme: 'auto',
  density: 'comfortable',
  typographyScale: 'default',
  brandEnergy: true,
  accent: { color: '#36e4ff', soft: 'rgba(54, 228, 255, 0.22)' }
};

describe('semanticTheme', () => {
  it('builds a stable versioned editorial package', () => {
    expect(buildSemanticThemeSnapshot(validInput)).toMatchObject({
      schemaVersion: NOEIS_THEME_SCHEMA_VERSION,
      packageId: NOEIS_THEME_PACKAGE_ID,
      variantId: 'theme.editorial.light'
    });
  });

  it('fails closed for incomplete or unknown variants', () => {
    expect(buildSemanticThemeSnapshot({ ...validInput, activeTheme: 'sepia' })).toBeNull();
    expect(buildSemanticThemeSnapshot({ ...validInput, accent: null })).toBeNull();
  });

  it('commits one canonical identity after compatibility attributes', () => {
    const root = document.createElement('html');
    const snapshot = buildSemanticThemeSnapshot({ ...validInput, activeTheme: 'dark' });
    expect(applySemanticThemeSnapshot(root, snapshot)).toBe(true);
    expect(root.getAttribute('data-noeis-theme')).toBe('theme.editorial.dark');
    expect(root.getAttribute('data-noeis-theme-package')).toBe(NOEIS_THEME_PACKAGE_ID);
    expect(root.getAttribute('data-ui-theme')).toBe('dark');
    expect(root.style.getPropertyValue('--ui-accent')).toBe('#36e4ff');
  });

  it('preserves the last known-good identity when a snapshot is invalid', () => {
    const root = document.createElement('html');
    root.setAttribute('data-noeis-theme', 'theme.editorial.light');
    expect(applySemanticThemeSnapshot(root, { schemaVersion: 99 })).toBe(false);
    expect(root.getAttribute('data-noeis-theme')).toBe('theme.editorial.light');
  });
});
