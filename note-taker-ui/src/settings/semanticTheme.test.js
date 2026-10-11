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
  typographyScale: 'default'
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
    expect(buildSemanticThemeSnapshot({ ...validInput, density: 'airy' })).toBeNull();
  });

  it('names the theme with one attribute', () => {
    const root = document.createElement('html');
    const snapshot = buildSemanticThemeSnapshot({ ...validInput, activeTheme: 'dark' });
    expect(applySemanticThemeSnapshot(root, snapshot)).toBe(true);
    expect(root.getAttribute('data-ui-theme')).toBe('dark');
    expect(root.getAttribute('data-ui-scheme')).toBe('dark');
  });

  it('commits Tokyo Midnight as its own dark-scheme variant', () => {
    const root = document.createElement('html');
    const snapshot = buildSemanticThemeSnapshot({
      ...validInput,
      activeTheme: 'tokyo-midnight',
      preferredTheme: 'tokyo-midnight'
    });
    expect(snapshot).toMatchObject({
      variantId: 'theme.editorial.tokyo-midnight',
      activeTheme: 'tokyo-midnight',
      preferredTheme: 'tokyo-midnight'
    });
    expect(applySemanticThemeSnapshot(root, snapshot)).toBe(true);
    expect(root.getAttribute('data-ui-theme')).toBe('tokyo-midnight');
    expect(root.getAttribute('data-ui-scheme')).toBe('dark');
  });

  it('preserves the last known-good identity when a snapshot is invalid', () => {
    const root = document.createElement('html');
    root.setAttribute('data-ui-theme', 'light');
    expect(applySemanticThemeSnapshot(root, { schemaVersion: 99 })).toBe(false);
    expect(root.getAttribute('data-ui-theme')).toBe('light');
  });
});
