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
    document.documentElement.style.removeProperty('--ui-accent');
    document.documentElement.style.removeProperty('--ui-accent-soft');
  });

  it('persists settings and applies root classes and variables', () => {
    const saved = {
      typographyScale: 'large',
      density: 'compact',
      theme: 'dark',
      accent: 'electric',
      brandEnergy: false
    };

    persistUiSettingsToStorage(saved);
    const restored = loadUiSettingsFromStorage();
    expect(restored).toEqual(saved);

    applyUiSettingsToRoot(document.documentElement, restored);

    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-ui-density')).toBe('compact');
    expect(document.documentElement.getAttribute('data-ui-typography')).toBe('large');
    expect(document.documentElement.getAttribute('data-ui-brand-energy')).toBe('off');
    expect(document.documentElement.style.getPropertyValue('--ui-accent')).toBe('#36e4ff');
  });

  it('default theme is now "auto" (system-tracking)', () => {
    expect(DEFAULT_UI_SETTINGS.theme).toBe('auto');
    expect(THEME_OPTIONS.map((option) => option.value)).toEqual(['auto', 'light', 'dark']);
  });

  it('resolveActiveTheme returns explicit values verbatim', () => {
    expect(resolveActiveTheme('light')).toBe('light');
    expect(resolveActiveTheme('dark')).toBe('dark');
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
  });
});
