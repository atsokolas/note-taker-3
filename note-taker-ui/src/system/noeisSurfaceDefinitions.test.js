import {
  NOEIS_SURFACE_DEFINITIONS,
  getAuthenticatedRoutePrefixes,
  getNoeisNavigationDefinitions,
  resolveNoeisSurfaceDefinition
} from './noeisSurfaceDefinitions';

describe('Noeis surface definitions', () => {
  it('owns four rooms and deterministic navigation projections', () => {
    expect(getNoeisNavigationDefinitions('primary').map(item => item.id)).toEqual([
      'surface.library', 'surface.think', 'surface.wiki', 'surface.judgment'
    ]);
    expect(getNoeisNavigationDefinitions('utility').map(item => item.id)).toEqual([
      'surface.connections', 'surface.settings'
    ]);
  });

  it('resolves room identity from the same match contract used by navigation', () => {
    expect(resolveNoeisSurfaceDefinition('/wiki/read/page-1')?.id).toBe('surface.wiki');
    expect(resolveNoeisSurfaceDefinition('/paper')?.id).toBe('surface.wiki');
    expect(resolveNoeisSurfaceDefinition('/settings')).toBeNull();
  });

  it('owns authenticated route prefixes without duplicates', () => {
    const prefixes = getAuthenticatedRoutePrefixes();
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(prefixes).toEqual(expect.arrayContaining(['/library', '/wiki', '/judgment', '/mirror', '/connections']));
    expect(NOEIS_SURFACE_DEFINITIONS.every(item => Object.isFrozen(item))).toBe(true);
  });
});
