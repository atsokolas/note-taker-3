const toTrimmedString = (value = '') => String(value || '').trim();

const slugSegment = (value = '') => {
  const normalized = toTrimmedString(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'untitled';
};

const normalizeSourcePath = (value = []) => {
  if (Array.isArray(value)) {
    return value.map(segment => toTrimmedString(segment)).filter(Boolean);
  }
  const safeValue = toTrimmedString(value);
  if (!safeValue) return [];
  return safeValue
    .split('/')
    .map(segment => toTrimmedString(segment))
    .filter(Boolean);
};

const ensureNotebookImportFolderPath = async ({
  NotebookFolder,
  userId,
  provider,
  sourceLabel,
  sourceType = '',
  folderOwnership = 'import_mirror',
  sourcePath = []
} = {}) => {
  const FolderModel = NotebookFolder || require('../models/index.js').NotebookFolder;
  const rootLabel = toTrimmedString(sourceLabel);
  const pathSegments = normalizeSourcePath(sourcePath);
  const fullSegments = [rootLabel, ...pathSegments].filter(Boolean);
  if (!userId || !provider || fullSegments.length === 0) {
    return {
      folder: null,
      createdFolders: [],
      sourcePath: fullSegments.join(' / ')
    };
  }

  const createdFolders = [];
  let parentFolderId = null;
  let parentExternalId = '';
  let folder = null;

  for (let index = 0; index < fullSegments.length; index += 1) {
    const name = fullSegments[index];
    const lineageSegments = fullSegments.slice(0, index + 1);
    const externalId = `${slugSegment(provider)}:${lineageSegments.map(segment => slugSegment(segment)).join('/')}`;
    const folderSourcePath = lineageSegments.join(' / ');

    folder = await FolderModel.findOne({
      userId,
      'importMeta.externalId': externalId
    });

    if (!folder) {
      folder = new FolderModel({
        name,
        userId,
        parentFolderId,
        sortOrder: 0,
        importMeta: {
          provider: toTrimmedString(provider),
          sourceType: toTrimmedString(sourceType),
          sourceLabel: rootLabel,
          externalId,
          parentExternalId,
          sourcePath: folderSourcePath,
          folderOwnership: toTrimmedString(folderOwnership) || 'import_mirror',
          importedAt: new Date()
        }
      });
      await folder.save();
      createdFolders.push(folder);
    }

    parentFolderId = folder?._id || null;
    parentExternalId = externalId;
  }

  return {
    folder,
    createdFolders,
    sourcePath: fullSegments.join(' / ')
  };
};

module.exports = {
  ensureNotebookImportFolderPath,
  normalizeSourcePath,
  slugSegment
};
