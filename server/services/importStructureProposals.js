const clean = (value) => String(value || '').trim();

const titleCase = (value = '') => (
  clean(value)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ')
);

const buildSourceLabel = ({ provider = '', sourceLabel = '' } = {}) => {
  const label = clean(sourceLabel);
  if (label) return label;
  const providerLabel = titleCase(provider);
  return providerLabel || 'Import';
};

const buildDestinationFolderName = ({ provider = '', sourceLabel = '', targetDomain = '' } = {}) => {
  const label = buildSourceLabel({ provider, sourceLabel });
  const suffix = targetDomain === 'library' ? 'articles' : 'notes';
  return `${label} ${suffix}`.slice(0, 96).trim();
};

const uniqueIds = (ids = []) => {
  const seen = new Set();
  return (Array.isArray(ids) ? ids : [])
    .map(clean)
    .filter(Boolean)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
};

const buildMoveOperations = ({
  ids = [],
  targetDomain = '',
  folderName = '',
  opPrefix = ''
} = {}) => {
  const safeIds = uniqueIds(ids);
  if (safeIds.length === 0 || !clean(targetDomain) || !clean(folderName)) return [];
  return [
    {
      opId: `create-${opPrefix || targetDomain}-folder`,
      type: 'create_folder',
      targetDomain,
      status: 'pending',
      payload: { name: folderName },
      preview: { folderName },
      risk: 'low'
    },
    ...safeIds.map((id, index) => ({
      opId: `move-${opPrefix || targetDomain}-${index + 1}`,
      type: 'move_item',
      targetDomain,
      status: 'pending',
      payload: {
        itemId: id,
        destinationFolderName: folderName
      },
      preview: {
        itemId: id,
        destinationFolderName: folderName
      },
      risk: 'low'
    }))
  ];
};

const buildImportStructureProposalPayload = ({
  userId = '',
  importSession = null,
  articleIds = [],
  notebookEntryIds = []
} = {}) => {
  const session = importSession && typeof importSession === 'object' ? importSession : {};
  const sessionId = clean(session._id || session.id);
  const provider = clean(session.provider);
  const sourceLabel = clean(session.sourceLabel);
  const label = buildSourceLabel({ provider, sourceLabel });
  const libraryFolderName = buildDestinationFolderName({ provider, sourceLabel, targetDomain: 'library' });
  const notebookFolderName = buildDestinationFolderName({ provider, sourceLabel, targetDomain: 'notebook' });
  const operations = [
    ...buildMoveOperations({
      ids: articleIds,
      targetDomain: 'library',
      folderName: libraryFolderName,
      opPrefix: 'library-import'
    }),
    ...buildMoveOperations({
      ids: notebookEntryIds,
      targetDomain: 'notebook',
      folderName: notebookFolderName,
      opPrefix: 'notebook-import'
    })
  ];
  const itemCount = uniqueIds(articleIds).length + uniqueIds(notebookEntryIds).length;

  if (!clean(userId) || !sessionId || operations.length === 0) return null;

  return {
    userId,
    sourceBundleId: `import-session:${sessionId}:organize`,
    scope: 'import_session',
    scopeRef: sessionId,
    status: 'pending',
    title: `Organize ${label}`,
    summary: `Review ${itemCount} imported ${itemCount === 1 ? 'item' : 'items'} from ${label} and move them into cleaner folders before they blend into the rest of the workspace.`,
    rationale: 'Import cleanup should be reviewable and reversible instead of silently changing the library structure.',
    operations,
    createdBy: {
      actorType: 'native_agent',
      actorId: 'import-organizer'
    }
  };
};

const findExistingImportStructureProposal = async ({
  AgentStructureProposal,
  userId = '',
  importSessionId = ''
} = {}) => {
  if (!AgentStructureProposal || typeof AgentStructureProposal.findOne !== 'function') return null;
  const scopeRef = clean(importSessionId);
  if (!clean(userId) || !scopeRef) return null;
  return AgentStructureProposal.findOne({
    userId,
    scope: 'import_session',
    scopeRef,
    status: 'pending'
  });
};

const stageImportStructureProposal = async ({
  AgentStructureProposal,
  userId = '',
  importSession = null,
  articleIds = [],
  notebookEntryIds = []
} = {}) => {
  if (!AgentStructureProposal || typeof AgentStructureProposal.create !== 'function') return null;
  const sessionId = clean(importSession?._id || importSession?.id);
  const existing = await findExistingImportStructureProposal({
    AgentStructureProposal,
    userId,
    importSessionId: sessionId
  });
  if (existing) return existing;

  const payload = buildImportStructureProposalPayload({
    userId,
    importSession,
    articleIds,
    notebookEntryIds
  });
  if (!payload) return null;
  return AgentStructureProposal.create(payload);
};

module.exports = {
  buildImportStructureProposalPayload,
  stageImportStructureProposal
};
