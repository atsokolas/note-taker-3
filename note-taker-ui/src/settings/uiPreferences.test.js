import {
  applyUiSettingsToRoot,
  loadUiSettingsFromStorage,
  persistUiSettingsToStorage
} from './uiPreferences';

describe('uiPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-ui-theme');
    document.documentElement.removeAttribute('data-ui-density');
    document.documentElement.removeAttribute('data-ui-typography');
    document.documentElement.style.removeProperty('--ui-accent');
    document.documentElement.style.removeProperty('--ui-accent-soft');
  });

  it('persists settings and applies root classes and variables', () => {
    const saved = {
      typographyScale: 'large',
      density: 'compact',
      theme: 'dark',
      accent: 'rose'
    };

    persistUiSettingsToStorage(saved);
    const restored = loadUiSettingsFromStorage();
    expect(restored).toEqual(saved);

    applyUiSettingsToRoot(document.documentElement, restored);

    expect(document.documentElement.getAttribute('data-ui-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-ui-density')).toBe('compact');
    expect(document.documentElement.getAttribute('data-ui-typography')).toBe('large');
    expect(document.documentElement.style.getPropertyValue('--ui-accent')).toBe('#be185d');
  });
});
