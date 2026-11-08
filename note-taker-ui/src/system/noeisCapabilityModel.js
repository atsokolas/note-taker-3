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
    description: 'Save a page or a passage from the browser.',
    helper: 'Set up the browser extension.',
    readiness: 'local',
    path: '/connections#capture',
    commandKeywords: 'chrome browser extension capture clip'
  }),
  Object.freeze({
    id: 'connector.files',
    key: 'files',
    name: 'Kindle and other files',
    description: 'Kindle’s My Clippings.txt, Apple Books, Pocket, Instapaper, Obsidian or a folder of Markdown.',
    helper: 'Comes in once. Bringing the same file again never doubles anything.',
    readiness: 'local',
    path: '/connections?source=files#files',
    sourcePicker: true,
    commandKeywords: 'file markdown text paste upload import export kindle clippings apple books pocket instapaper obsidian notion vault'
  }),
  Object.freeze({
    id: 'connector.readwise',
    key: 'readwise',
    name: 'Readwise',
    description: 'Every highlight you have in Readwise, with its book or article.',
    helper: 'Stays connected, and new highlights come in on their own.',
    readiness: 'connection',
    path: '/connections?source=readwise#readwise',
    sourcePicker: true,
    commandKeywords: 'readwise highlights reading import sync'
  }),
  Object.freeze({
    id: 'connector.notion',
    key: 'notion',
    name: 'Notion',
    description: 'The pages and database rows you choose to share with Noeis.',
    helper: 'Stays connected, and changes come in when you sync.',
    readiness: 'connection',
    path: '/connections?source=notion#notion',
    sourcePicker: true,
    commandKeywords: 'notion pages database import sync'
  }),
  Object.freeze({
    id: 'connector.evernote',
    key: 'evernote',
    name: 'Evernote',
    description: 'Notebooks exported from Evernote as .enex files, each kept as its own notebook.',
    helper: 'Comes in once, from an export.',
    readiness: 'local',
    path: '/connections?source=evernote#evernote',
    sourcePicker: true,
    commandKeywords: 'evernote enex import notebook'
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
