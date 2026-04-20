const assert = require('assert');

const {
  ensureNotebookImportFolderPath
} = require('../notebookImportTreeService');

const clone = (value) => JSON.parse(JSON.stringify(value));
const readPath = (value, path) => String(path || '')
  .split('.')
  .filter(Boolean)
  .reduce((current, segment) => (current == null ? undefined : current[segment]), value);

const buildNotebookFolderModel = () => {
  const records = [];
  let nextId = 1;

  function NotebookFolder(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || `folder-${nextId++}`;
  }

  NotebookFolder.records = records;

  NotebookFolder.findOne = async (query = {}) => {
    const record = records.find((candidate) => Object.entries(query).every(([key, expected]) => {
      const actual = readPath(candidate, key) ?? null;
      const normalizedExpected = expected ?? null;
      return String(actual) === String(normalizedExpected);
    }));
    return record ? new NotebookFolder(clone(record)) : null;
  };

  NotebookFolder.prototype.save = async function save() {
    const stored = {
      _id: this._id,
      name: this.name,
      userId: this.userId,
      parentFolderId: this.parentFolderId ?? null,
      sortOrder: this.sortOrder ?? 0,
      importMeta: clone(this.importMeta || {})
    };
    const existingIndex = records.findIndex(record => String(record._id) === String(stored._id));
    if (existingIndex >= 0) {
      records[existingIndex] = stored;
    } else {
      records.push(stored);
    }
    return this;
  };

  return NotebookFolder;
};

const run = async () => {
  const NotebookFolder = buildNotebookFolderModel();

  const firstPass = await ensureNotebookImportFolderPath({
    NotebookFolder,
    userId: 'user-1',
    provider: 'notion',
    sourceLabel: 'Product Wiki',
    folderOwnership: 'import_mirror',
    sourcePath: ['Projects', 'Alpha']
  });

  assert(firstPass, 'expected a folder result');
  assert.strictEqual(firstPass.folder.name, 'Alpha');
  assert.strictEqual(String(firstPass.folder.parentFolderId), 'folder-2');
  assert.strictEqual(firstPass.createdFolders.length, 3);
  assert.deepStrictEqual(
    NotebookFolder.records.map((folder) => ({
      name: folder.name,
      parentFolderId: folder.parentFolderId,
      externalId: folder.importMeta.externalId,
      parentExternalId: folder.importMeta.parentExternalId,
      sourcePath: folder.importMeta.sourcePath,
      folderOwnership: folder.importMeta.folderOwnership
    })),
    [
      {
        name: 'Product Wiki',
        parentFolderId: null,
        externalId: 'notion:product-wiki',
        parentExternalId: '',
        sourcePath: 'Product Wiki',
        folderOwnership: 'import_mirror'
      },
      {
        name: 'Projects',
        parentFolderId: 'folder-1',
        externalId: 'notion:product-wiki/projects',
        parentExternalId: 'notion:product-wiki',
        sourcePath: 'Product Wiki / Projects',
        folderOwnership: 'import_mirror'
      },
      {
        name: 'Alpha',
        parentFolderId: 'folder-2',
        externalId: 'notion:product-wiki/projects/alpha',
        parentExternalId: 'notion:product-wiki/projects',
        sourcePath: 'Product Wiki / Projects / Alpha',
        folderOwnership: 'import_mirror'
      }
    ]
  );

  const secondPass = await ensureNotebookImportFolderPath({
    NotebookFolder,
    userId: 'user-1',
    provider: 'notion',
    sourceLabel: 'Product Wiki',
    folderOwnership: 'import_mirror',
    sourcePath: ['Projects', 'Alpha']
  });

  assert(secondPass, 'expected a folder result on rerun');
  assert.strictEqual(secondPass.createdFolders.length, 0);
  assert.strictEqual(String(secondPass.folder._id), String(firstPass.folder._id));
  assert.strictEqual(NotebookFolder.records.length, 3);

  const evernotePass = await ensureNotebookImportFolderPath({
    NotebookFolder,
    userId: 'user-1',
    provider: 'evernote',
    sourceType: 'enex',
    sourceLabel: 'Evernote Import',
    folderOwnership: 'import_mirror',
    sourcePath: ['Stack', 'Notebook']
  });

  assert(evernotePass, 'expected an Evernote folder result');
  assert.strictEqual(evernotePass.folder.name, 'Notebook');
  assert.strictEqual(String(evernotePass.folder.parentFolderId), 'folder-5');
  assert.strictEqual(evernotePass.sourcePath, 'Evernote Import / Stack / Notebook');
  assert.deepStrictEqual(
    NotebookFolder.records.slice(3).map((folder) => ({
      name: folder.name,
      parentFolderId: folder.parentFolderId,
      sourceType: folder.importMeta.sourceType,
      externalId: folder.importMeta.externalId,
      parentExternalId: folder.importMeta.parentExternalId,
      sourcePath: folder.importMeta.sourcePath
    })),
    [
      {
        name: 'Evernote Import',
        parentFolderId: null,
        sourceType: 'enex',
        externalId: 'evernote:evernote-import',
        parentExternalId: '',
        sourcePath: 'Evernote Import'
      },
      {
        name: 'Stack',
        parentFolderId: 'folder-4',
        sourceType: 'enex',
        externalId: 'evernote:evernote-import/stack',
        parentExternalId: 'evernote:evernote-import',
        sourcePath: 'Evernote Import / Stack'
      },
      {
        name: 'Notebook',
        parentFolderId: 'folder-5',
        sourceType: 'enex',
        externalId: 'evernote:evernote-import/stack/notebook',
        parentExternalId: 'evernote:evernote-import/stack',
        sourcePath: 'Evernote Import / Stack / Notebook'
      }
    ]
  );
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('notebookImportTreeService folder-path test passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
