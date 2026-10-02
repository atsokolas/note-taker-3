import {
  applyUiSettingsToRoot,
  loadUiSettingsFromStorage,
  persistUiSettingsToStorage,
  resolveActiveTheme,
  THEME_OPTIONS,
  DEFAULT_UI_SETTINGS
} from './uiPreferences';

describe('uiPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-ui-theme');
    document.documentElement.removeAttribute('data-ui-density');
    document.documentElement.removeAttribute('data-ui-typography');
    document.documentElement.removeAttribute('data-ui-brand-energy');
    document.documentElement.removeAttribute('data-noeis-theme');
    document.documentElement.removeAttribute('data-noeis-theme-package');
    document.documentElement.removeAttribute('data-noeis-theme-schema');
    document.documentElement.style.removeProperty('--ui-accent');
    document.documentElement.style.removeProperty('--ui-accent-soft');
  });

  it('persists settings and applies root classes and variables', () => {
    const saved = {
      typographyScale: 'large',
      density: 'compact',
      theme: 'dark',
      accent: 'electric',
      brandEnergy: false,
      motion: 'system'
    };

    persistUiSettingsToStorage(saved);
    const restored = loadUiSettingsFromStorage();
    expect(restored).toEqual(saved);

    applyUiSettingsToRoot(document.documentElement, restored);

    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-ui-scheme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-ui-density')).toBe('compact');
    expect(document.documentElement.getAttribute('data-ui-typography')).toBe('large');
    expect(document.documentElement.getAttribute('data-ui-brand-energy')).toBe('off');
    expect(document.documentElement.getAttribute('data-noeis-theme')).toBe('theme.editorial.dark');
    expect(document.documentElement.getAttribute('data-noeis-theme-package')).toBe('theme.editorial');
    expect(document.documentElement.getAttribute('data-noeis-theme-schema')).toBe('1');
    expect(document.documentElement.style.getPropertyValue('--ui-accent')).toBe('#36e4ff');
  });

  it('default theme is now "auto" (system-tracking)', () => {
    expect(DEFAULT_UI_SETTINGS.theme).toBe('auto');
    expect(THEME_OPTIONS.map((option) => option.value)).toEqual(['auto', 'light', 'dark', 'tokyo-midnight']);
    expect(THEME_OPTIONS.find((option) => option.value === 'tokyo-midnight').label).toBe('Tokyo Midnight');
  });

  it('resolveActiveTheme returns explicit values verbatim', () => {
    expect(resolveActiveTheme('light')).toBe('light');
    expect(resolveActiveTheme('dark')).toBe('dark');
    expect(resolveActiveTheme('tokyo-midnight')).toBe('tokyo-midnight');
  });

  it('resolveActiveTheme honors a stub mediaQuery for auto', () => {
    expect(resolveActiveTheme('auto', { matches: false })).toBe('light');
    expect(resolveActiveTheme('auto', { matches: true })).toBe('dark');
  });

  it('resolveActiveTheme falls back through window.matchMedia when no stub', () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    expect(resolveActiveTheme('auto')).toBe('dark');
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    expect(resolveActiveTheme('auto')).toBe('light');
    window.matchMedia = original;
  });

  it('applyUiSettingsToRoot exposes both resolved theme and the user preference', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    applyUiSettingsToRoot(document.documentElement, {
      ...DEFAULT_UI_SETTINGS,
      theme: 'auto'
    });
    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-ui-theme-pref')).toBe('auto');

    applyUiSettingsToRoot(document.documentElement, {
      ...DEFAULT_UI_SETTINGS,
      theme: 'light'
    });
    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-ui-theme-pref')).toBe('light');
    expect(document.documentElement.getAttribute('data-ui-scheme')).toBe('light');
  });

  it('persists Tokyo Midnight and keeps stored light and dark preferences', () => {
    persistUiSettingsToStorage({ ...DEFAULT_UI_SETTINGS, theme: 'tokyo-midnight' });
    expect(loadUiSettingsFromStorage().theme).toBe('tokyo-midnight');

    persistUiSettingsToStorage({ ...DEFAULT_UI_SETTINGS, theme: 'dark' });
    expect(loadUiSettingsFromStorage().theme).toBe('dark');

    persistUiSettingsToStorage({ ...DEFAULT_UI_SETTINGS, theme: 'light' });
    expect(loadUiSettingsFromStorage().theme).toBe('light');

    persistUiSettingsToStorage({ ...DEFAULT_UI_SETTINGS, theme: 'not-a-theme' });
    expect(loadUiSettingsFromStorage().theme).toBe('auto');
  });

  it('keeps Tokyo Midnight when the OS color scheme changes', () => {
    expect(resolveActiveTheme('tokyo-midnight', { matches: true })).toBe('tokyo-midnight');
    expect(resolveActiveTheme('tokyo-midnight', { matches: false })).toBe('tokyo-midnight');
    expect(resolveActiveTheme('auto', { matches: true })).toBe('dark');
    expect(resolveActiveTheme('auto', { matches: false })).toBe('light');
  });

  it('applies Tokyo Midnight without clearing an in-progress draft', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    document.body.innerHTML = '<textarea id="draft">a sentence in progress</textarea>';
    applyUiSettingsToRoot(document.documentElement, {
      ...DEFAULT_UI_SETTINGS,
      theme: 'tokyo-midnight'
    });
    expect(document.getElementById('draft').value).toBe('a sentence in progress');
    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('tokyo-midnight');
    expect(document.documentElement.getAttribute('data-ui-theme-pref')).toBe('tokyo-midnight');
    expect(document.documentElement.getAttribute('data-ui-scheme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-noeis-theme')).toBe('theme.editorial.tokyo-midnight');
    document.body.innerHTML = '';
  });
});
