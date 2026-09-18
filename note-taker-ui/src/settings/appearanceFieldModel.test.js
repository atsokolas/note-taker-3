import {
  appearanceDiffKeys,
  mergeRemoteIntoDraft,
  pickAppearancePatch
} from './appearanceFieldModel';

describe('appearanceFieldModel', () => {
  const base = {
    typographyScale: 'default',
    density: 'comfortable',
    theme: 'auto',
    accent: 'electric',
    brandEnergy: true,
    motion: 'system'
  };

  it('patches only changed appearance fields', () => {
    const draft = { ...base, typographyScale: 'large', theme: 'dark' };
    expect(pickAppearancePatch(base, draft)).toEqual({
      typographyScale: 'large',
      theme: 'dark'
    });
  });

  it('merges non-overlapping remote changes into a draft', () => {
    const editStart = { ...base };
    const draft = { ...base, typographyScale: 'large' };
    const remote = { ...base, density: 'compact' };
    const merged = mergeRemoteIntoDraft(draft, editStart, remote);
    expect(merged.typographyScale).toBe('large');
    expect(merged.density).toBe('compact');
  });

  it('lists keys that differ between snapshots', () => {
    expect(appearanceDiffKeys(base, { ...base, accent: 'violet' })).toEqual(['accent']);
  });
});
