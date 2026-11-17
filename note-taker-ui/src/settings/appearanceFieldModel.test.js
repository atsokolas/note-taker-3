import { pickAppearancePatch } from './appearanceFieldModel';

describe('appearanceFieldModel', () => {
  const base = {
    typographyScale: 'default',
    density: 'comfortable',
    theme: 'auto',
    motion: 'system'
  };

  it('patches only changed appearance fields', () => {
    const next = { ...base, typographyScale: 'large', theme: 'dark' };
    expect(pickAppearancePatch(base, next)).toEqual({
      typographyScale: 'large',
      theme: 'dark'
    });
    expect(pickAppearancePatch(base, base)).toEqual({});
  });
});
