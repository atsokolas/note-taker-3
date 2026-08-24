import { resolveContextualAgentContract } from '../agent/contextualAgentContracts';
import { THEME_OPTIONS } from '../settings/uiPreferences';
import { NOEIS_CONNECTORS } from './noeisCapabilityModel';
import { NOEIS_LOOP_DEFINITIONS } from './noeisLoopModel';
import { NOEIS_SURFACE_DEFINITIONS } from './noeisSurfaceDefinitions';

export const NOEIS_MANIFEST_SCHEMA_VERSION = 1;

export const NOEIS_SYSTEM_KINDS = Object.freeze([
  'surface',
  'agent',
  'capability',
  'connector',
  'loop',
  'theme'
]);

const ID_PATTERN = /^(surface|agent|capability|connector|loop|theme)\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

const normalizeDependencies = (dependencies) => (
  Array.isArray(dependencies)
    ? [...new Set(dependencies.map(value => String(value || '').trim()).filter(Boolean))].sort()
    : []
);

export const validateNoeisManifest = (candidate) => {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, errors: ['Manifest must be an object.'], manifest: null };
  }

  if (candidate.schemaVersion !== NOEIS_MANIFEST_SCHEMA_VERSION) {
    errors.push(`Unsupported schema version: ${candidate.schemaVersion ?? 'missing'}.`);
  }
  const kind = String(candidate.kind || '').trim();
  if (!NOEIS_SYSTEM_KINDS.includes(kind)) errors.push(`Unsupported manifest kind: ${kind || 'missing'}.`);

  const id = String(candidate.id || '').trim();
  if (!ID_PATTERN.test(id)) errors.push(`Invalid manifest id: ${id || 'missing'}.`);
  if (kind && id && !id.startsWith(`${kind}.`)) errors.push(`Manifest id ${id} does not match kind ${kind}.`);

  const name = String(candidate.name || '').trim();
  if (!name) errors.push('Manifest name is required.');
  const version = String(candidate.version || '').trim();
  if (!version) errors.push('Manifest version is required.');

  const dependencies = normalizeDependencies(candidate.dependencies);
  dependencies.forEach((dependencyId) => {
    if (!ID_PATTERN.test(dependencyId)) errors.push(`Invalid dependency id: ${dependencyId}.`);
  });

  ['execute', 'handler', 'authorize', 'mutate', 'write'].forEach((field) => {
    if (field in candidate) errors.push(`Registry metadata cannot define ${field}.`);
  });

  const manifest = errors.length ? null : Object.freeze({
    ...candidate,
    schemaVersion: NOEIS_MANIFEST_SCHEMA_VERSION,
    id,
    kind,
    name,
    version,
    description: String(candidate.description || '').trim(),
    sourcePath: String(candidate.sourcePath || '').trim(),
    dependencies
  });

  return { valid: errors.length === 0, errors, manifest };
};

export class NoeisSystemRegistry {
  constructor(manifests = []) {
    this.items = new Map();
    this.diagnostics = [];
    manifests.forEach(manifest => this.register(manifest));
    this.validateDependencies();
  }

  register(candidate) {
    const result = validateNoeisManifest(candidate);
    if (!result.valid) {
      this.diagnostics.push({ id: String(candidate?.id || 'invalid'), errors: result.errors });
      return false;
    }
    if (this.items.has(result.manifest.id)) {
      this.diagnostics.push({ id: result.manifest.id, errors: [`Duplicate manifest id: ${result.manifest.id}.`] });
      return false;
    }
    this.items.set(result.manifest.id, result.manifest);
    return true;
  }

  validateDependencies() {
    this.items.forEach((manifest) => {
      const missing = manifest.dependencies.filter(dependencyId => !this.items.has(dependencyId));
      if (missing.length) {
        this.diagnostics.push({
          id: manifest.id,
          errors: missing.map(dependencyId => `Missing dependency: ${dependencyId}.`)
        });
      }
    });
  }

  list(kind = '') {
    return [...this.items.values()]
      .filter(item => !kind || item.kind === kind)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  resolve(id) {
    return this.items.get(String(id || '').trim()) || null;
  }

  getDiagnostics(id = '') {
    return this.diagnostics.filter(entry => !id || entry.id === id);
  }
}

const capabilityManifests = [
  ['capability.library.retrieve', 'Retrieve source evidence', 'Library and contextual-agent retrieval.', []],
  ['capability.knowledge.connect', 'Connect knowledge objects', 'Durable relationships across Library, Think, Wiki, and Judgment.', []],
  ['capability.wiki.build', 'Build grounded Wiki pages', 'Create ordinary Wiki knowledge from owned evidence.', ['capability.library.retrieve']],
  ['capability.wiki.maintain', 'Maintain accepted Wiki knowledge', 'Propose evidence-bound changes without silently replacing accepted knowledge.', ['capability.wiki.build']],
  ['capability.judgment.review', 'Review consequential claims', 'Move accepted claims through explicit judgment and outcome review.', ['capability.knowledge.connect']]
].map(([id, name, description, dependencies]) => ({
  schemaVersion: 1,
  id,
  kind: 'capability',
  name,
  version: '1.0.0',
  description,
  dependencies,
  sourcePath: 'existing API and service contracts'
}));

const connectorManifests = NOEIS_CONNECTORS.map(connector => ({
  schemaVersion: 1,
  id: connector.id,
  kind: 'connector',
  name: connector.name,
  version: '1.0.0',
  description: connector.description,
  sourcePath: 'note-taker-ui/src/system/noeisCapabilityModel.js',
  readinessPath: connector.path
}));

const loopManifests = NOEIS_LOOP_DEFINITIONS.map(({ id, name, description }) => ({
  schemaVersion: 1,
  id,
  kind: 'loop',
  name,
  version: '1.0.0',
  description,
  sourcePath: 'existing scheduler and API contracts'
}));

export const buildNoeisSystemManifests = () => {
  const themes = THEME_OPTIONS.map(theme => ({
    schemaVersion: 1,
    id: `theme.${theme.value}`,
    kind: 'theme',
    name: `${theme.label} editorial theme`,
    version: '1.0.0',
    description: 'Existing semantic UI preference.',
    sourcePath: 'note-taker-ui/src/settings/uiPreferences.js',
    preferenceValue: theme.value
  }));

  return [
    ...NOEIS_SURFACE_DEFINITIONS,
    {
      schemaVersion: 1,
      id: 'agent.context-partner',
      kind: 'agent',
      name: 'Context partner',
      version: '1.0.0',
      description: 'Retrieves against the active knowledge surface; the user accepts any write.',
      sourcePath: 'note-taker-ui/src/agent/AgentRailContext.jsx',
      dependencies: ['capability.library.retrieve']
    },
    ...capabilityManifests,
    ...connectorManifests,
    ...loopManifests,
    ...themes
  ];
};

const diagnosticFor = (registry, id) => registry.getDiagnostics(id).flatMap(entry => entry.errors);

export const createNoeisSystemInventory = ({ pathname = '/', theme = 'auto', connectorRuntime = {}, loopRuntime = {} } = {}) => {
  const registry = new NoeisSystemRegistry(buildNoeisSystemManifests());
  const activeAgentContract = resolveContextualAgentContract({ pathname });
  const items = registry.list().map((manifest) => {
    const diagnostics = diagnosticFor(registry, manifest.id);
    let status = diagnostics.length ? 'invalid' : 'available';
    let activeBecause = [];

    if (manifest.kind === 'surface' && typeof manifest.match === 'function' && manifest.match({ pathname })) {
      status = 'active';
      activeBecause = [`The current route is ${pathname}.`];
    } else if (manifest.kind === 'agent' && activeAgentContract?.agentId === manifest.id) {
      status = 'active';
      activeBecause = [activeAgentContract.presentation === 'embedded'
        ? 'The current Wiki workbench projects this agent into its build composer.'
        : 'The current room supports the persistent contextual rail.'];
    } else if (manifest.kind === 'theme' && manifest.preferenceValue === theme) {
      status = 'active';
      activeBecause = [`Workspace theme preference is ${theme}.`];
    } else if (manifest.kind === 'connector') {
      const runtime = connectorRuntime[manifest.id];
      status = runtime?.status || 'checking';
      activeBecause = [runtime?.reason || 'Connection readiness is being checked.'];
    } else if (manifest.kind === 'loop') {
      const runtime = loopRuntime[manifest.id];
      status = runtime?.status || 'checking';
      activeBecause = [runtime?.reason || 'Durable loop status is being checked.'];
    }

    return {
      id: manifest.id,
      kind: manifest.kind,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      status,
      activeBecause,
      sourcePath: manifest.sourcePath,
      dependencies: manifest.dependencies.map(id => ({
        id,
        status: registry.resolve(id) ? 'ready' : 'missing'
      })),
      diagnostics
    };
  });

  return {
    schemaVersion: NOEIS_MANIFEST_SCHEMA_VERSION,
    generatedFrom: 'system-registry',
    items,
    diagnostics: registry.getDiagnostics()
  };
};

export const createNoeisSystemRegistry = () => new NoeisSystemRegistry(buildNoeisSystemManifests());
