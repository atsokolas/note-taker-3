export const CONNECTOR_STATUS = Object.freeze({
  checking: 'checking',
  connected: 'connected',
  available: 'available',
  needsSetup: 'needs_setup',
  error: 'error'
});

export const NOEIS_CONNECTORS = Object.freeze([
  Object.freeze({
    id: 'connector.chrome-capture',
    key: 'chrome-capture',
    name: 'Chrome capture',
    description: 'Capture a page or selection directly from the browser.',
    helper: 'Install or inspect browser capture from Connections.',
    readiness: 'local',
    path: '/connections#capture',
    commandKeywords: 'chrome browser extension capture clip'
  }),
  Object.freeze({
    id: 'connector.readwise',
    key: 'readwise',
    name: 'Readwise',
    description: 'Bring in highlights and notes from your reading layer.',
    helper: 'Connect through browser approval first; token sync and CSV remain available as direct Noeis fallbacks.',
    readiness: 'connection',
    path: '/connections?source=readwise#readwise',
    sourcePicker: true,
    commandKeywords: 'readwise highlights reading import sync'
  }),
  Object.freeze({
    id: 'connector.notion',
    key: 'notion',
    name: 'Notion',
    description: 'Import pages plus database rows into notebook-ready text.',
    helper: 'OAuth connect, preview, and direct sync are live for accessible pages and database rows.',
    readiness: 'connection',
    path: '/connections?source=notion#notion',
    sourcePicker: true,
    commandKeywords: 'notion pages database import sync'
  }),
  Object.freeze({
    id: 'connector.evernote',
    key: 'evernote',
    name: 'Evernote',
    description: 'Keep notebook migrations clean instead of flattening everything into one dump.',
    helper: 'ENEX import uses the same session, indexing, and activation flow as the direct providers.',
    readiness: 'local',
    path: '/connections?source=evernote#evernote',
    sourcePicker: true,
    commandKeywords: 'evernote enex import notebook'
  }),
  Object.freeze({
    id: 'connector.files',
    key: 'files',
    name: 'Files and text',
    description: 'Paste or upload markdown or plain text when you need a quick path.',
    helper: 'Useful for exports, clipped text, and one-off notes while direct connections are being added.',
    readiness: 'local',
    path: '/connections?source=files#files',
    sourcePicker: true,
    commandKeywords: 'file markdown text paste upload import'
  })
]);

const CONNECTOR_BY_ID = new Map(NOEIS_CONNECTORS.map(connector => [connector.id, connector]));
const CONNECTOR_BY_KEY = new Map(NOEIS_CONNECTORS.map(connector => [connector.key, connector]));

export const getNoeisConnector = (idOrKey = '') => (
  CONNECTOR_BY_ID.get(String(idOrKey || '').trim())
  || CONNECTOR_BY_KEY.get(String(idOrKey || '').trim())
  || null
);

export const getImportSourceOptions = () => NOEIS_CONNECTORS
  .filter(connector => connector.sourcePicker)
  .map(connector => ({
    key: connector.key,
    title: connector.name,
    subtitle: connector.description,
    status: 'Available today',
    helper: connector.helper
  }));

const isConnectedRow = (row = {}) => (
  Boolean(String(row.id || row._id || '').trim())
  && String(row.status || '').trim().toLowerCase() === 'connected'
);

const statusCopy = (connector, status) => {
  if (status === CONNECTOR_STATUS.connected) {
    return { label: 'Connected', reason: `${connector.name} is connected to this workspace.` };
  }
  if (status === CONNECTOR_STATUS.available) {
    return { label: 'Available', reason: `${connector.name} is ready when you choose to use it.` };
  }
  if (status === CONNECTOR_STATUS.needsSetup) {
    return { label: 'Needs setup', reason: `${connector.name} has no active workspace connection.` };
  }
  if (status === CONNECTOR_STATUS.error) {
    return { label: 'Unknown', reason: `${connector.name} readiness could not be checked.` };
  }
  return { label: 'Checking', reason: `${connector.name} readiness is being checked.` };
};

export const createConnectorRuntimeSnapshot = ({ connections = [], loading = false, error = '' } = {}) => {
  const safeConnections = Array.isArray(connections) ? connections : [];
  return Object.fromEntries(NOEIS_CONNECTORS.map((connector) => {
    let status = CONNECTOR_STATUS.available;
    if (connector.readiness === 'connection') {
      const providerRows = safeConnections.filter(row => String(row?.provider || '').trim() === connector.key);
      status = loading
        ? CONNECTOR_STATUS.checking
        : error
          ? CONNECTOR_STATUS.error
          : providerRows.some(isConnectedRow)
            ? CONNECTOR_STATUS.connected
            : CONNECTOR_STATUS.needsSetup;
    }
    const copy = statusCopy(connector, status);
    return [connector.id, {
      id: connector.id,
      key: connector.key,
      name: connector.name,
      path: connector.path,
      status,
      statusLabel: copy.label,
      reason: copy.reason
    }];
  }));
};

export const createConnectorCommands = (snapshot = {}) => NOEIS_CONNECTORS.map((connector) => {
  const runtime = snapshot[connector.id] || createConnectorRuntimeSnapshot({ loading: true })[connector.id];
  const verb = runtime.status === CONNECTOR_STATUS.connected ? 'Open' : 'Set up';
  return {
    id: `connection-${connector.key}`,
    type: 'Connection',
    label: `${verb} ${connector.name}`,
    path: connector.path,
    status: runtime.status,
    keywords: connector.commandKeywords
  };
});

export const resolveCapabilityAvailability = (capabilityId = '', snapshot = {}) => {
  const id = String(capabilityId || '').trim();
  if (!id) return { status: 'invalid', reason: 'Capability identity is missing.' };
  // The current room capabilities operate over material already stored in Noeis.
  // A live intake connector expands that corpus but is not a prerequisite for
  // retrieval, linking, Wiki maintenance, or Judgment review.
  return {
    id,
    status: 'available',
    reason: 'Available over knowledge already stored in this workspace.',
    connectorSnapshot: snapshot
  };
};
