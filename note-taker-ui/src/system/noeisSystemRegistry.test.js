import {
  NoeisSystemRegistry,
  buildNoeisSystemManifests,
  createNoeisSystemInventory,
  createNoeisSystemRegistry,
  validateNoeisManifest
} from './noeisSystemRegistry';
import { getPrimaryNavItems, getTopBarUtilityNavItems } from '../navigation/appNavigation';

const manifest = (overrides = {}) => ({
  schemaVersion: 1,
  id: 'surface.fixture',
  kind: 'surface',
  name: 'Fixture',
  version: '1.0.0',
  ...overrides
});

describe('NoeisSystemRegistry', () => {
  it('validates versioned, namespaced manifests and rejects invalid kinds', () => {
    expect(validateNoeisManifest(manifest()).valid).toBe(true);
    expect(validateNoeisManifest(manifest({ kind: 'plugin', id: 'plugin.fixture' }))).toEqual(expect.objectContaining({
      valid: false,
      errors: expect.arrayContaining([expect.stringContaining('Unsupported manifest kind')])
    }));
  });

  it('fails closed on duplicate identities and missing dependencies', () => {
    const registry = new NoeisSystemRegistry([
      manifest(),
      manifest({ name: 'Duplicate' }),
      manifest({ id: 'agent.fixture', kind: 'agent', dependencies: ['capability.missing'] })
    ]);

    expect(registry.list()).toHaveLength(2);
    expect(registry.getDiagnostics('surface.fixture')[0].errors[0]).toContain('Duplicate');
    expect(registry.getDiagnostics('agent.fixture')[0].errors[0]).toContain('Missing dependency');
  });

  it('keeps executable auth and write authority out of registry metadata', () => {
    ['execute', 'handler', 'authorize', 'mutate', 'write'].forEach((field) => {
      const result = validateNoeisManifest(manifest({ [field]: jest.fn() }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`Registry metadata cannot define ${field}.`);
    });
  });

  it('adapts the existing primary and utility navigation without inventing another list', () => {
    const registry = createNoeisSystemRegistry();
    const navigationNames = registry.list('surface').map(item => item.name);
    const expected = [
      ...getPrimaryNavItems().map(item => item.label),
      ...getTopBarUtilityNavItems().map(item => item.label)
    ];

    expected.forEach(name => expect(navigationNames).toContain(name));
    expect(buildNoeisSystemManifests()).toHaveLength(registry.list().length);
  });

  it('explains current surface, contextual agent, theme, and runtime connector readiness honestly', () => {
    const inventory = createNoeisSystemInventory({
      pathname: '/wiki',
      theme: 'dark',
      connectorRuntime: {
        'connector.readwise': { status: 'connected', reason: 'Readwise is connected to this workspace.' }
      },
      loopRuntime: {
        'loop.wiki-maintenance': { status: 'running', reason: 'Wiki maintenance is running.' }
      }
    });
    const byId = Object.fromEntries(inventory.items.map(item => [item.id, item]));

    expect(byId['surface.wiki'].status).toBe('active');
    expect(byId['agent.context-partner'].status).toBe('active');
    expect(byId['theme.dark'].status).toBe('active');
    expect(byId['connector.readwise'].status).toBe('connected');
    expect(byId['connector.readwise'].activeBecause[0]).toContain('connected');
    expect(byId['connector.notion'].status).toBe('checking');
    expect(byId['loop.wiki-maintenance'].status).toBe('running');
    expect(byId['loop.wiki-maintenance'].activeBecause[0]).toContain('running');
    expect(byId['loop.morning-paper'].status).toBe('checking');
  });

  it('reports the Wiki workbench as an embedded projection of the same agent', () => {
    const inventory = createNoeisSystemInventory({ pathname: '/wiki/workspace', theme: 'auto' });
    const byId = Object.fromEntries(inventory.items.map(item => [item.id, item]));

    expect(byId['agent.context-partner'].status).toBe('active');
    expect(byId['agent.context-partner'].activeBecause[0]).toContain('build composer');
    expect(Object.keys(byId)).not.toContain('agent.wiki-workspace');
  });
});
