import {
  CONNECTOR_STATUS,
  createConnectorCommands,
  createConnectorRuntimeSnapshot,
  getImportSourceOptions,
  resolveCapabilityAvailability
} from './noeisCapabilityModel';

describe('noeisCapabilityModel', () => {
  it('uses one catalog for the four import source cards', () => {
    expect(getImportSourceOptions().map(option => option.key)).toEqual(['readwise', 'notion', 'evernote', 'files']);
  });

  it('fails closed when remote readiness cannot be checked', () => {
    const snapshot = createConnectorRuntimeSnapshot({ error: 'offline' });
    expect(snapshot['connector.readwise'].status).toBe(CONNECTOR_STATUS.error);
    expect(snapshot['connector.notion'].status).toBe(CONNECTOR_STATUS.error);
    expect(snapshot['connector.files'].status).toBe(CONNECTOR_STATUS.available);
  });

  it('requires a connected row with identity before claiming a provider is connected', () => {
    const snapshot = createConnectorRuntimeSnapshot({
      connections: [
        { provider: 'readwise', status: 'connected' },
        { id: 'notion-1', provider: 'notion', status: 'connected' }
      ]
    });
    expect(snapshot['connector.readwise'].status).toBe(CONNECTOR_STATUS.needsSetup);
    expect(snapshot['connector.notion'].status).toBe(CONNECTOR_STATUS.connected);
  });

  it('projects connection commands without inventing a second connector list', () => {
    const snapshot = createConnectorRuntimeSnapshot({
      connections: [{ id: 'rw-1', provider: 'readwise', status: 'connected' }]
    });
    const byId = Object.fromEntries(createConnectorCommands(snapshot).map(command => [command.id, command]));
    expect(byId['connection-readwise']).toEqual(expect.objectContaining({ label: 'Open Readwise', path: '/connections?source=readwise#readwise' }));
    expect(byId['connection-notion'].label).toBe('Set up Notion');
  });

  it('keeps room capabilities available over stored knowledge without a live connector', () => {
    expect(resolveCapabilityAvailability('capability.library.retrieve').status).toBe('available');
  });
});
