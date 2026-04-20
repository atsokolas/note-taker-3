const assert = require('assert');
const express = require('express');
const http = require('http');

const { buildNotebookRouter } = require('../notebookRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve({
      server,
      url: `http://127.0.0.1:${address.port}`
    });
  });
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const compareValues = (left, right) => {
  const leftNull = left === null || left === undefined;
  const rightNull = right === null || right === undefined;
  if (leftNull && rightNull) return 0;
  if (leftNull) return -1;
  if (rightNull) return 1;
  return String(left).localeCompare(String(right));
};

const sortFolders = (folders, sortSpec = {}) => {
  const entries = Object.entries(sortSpec);
  return folders.slice().sort((left, right) => {
    for (const [field, direction] of entries) {
      const diff = compareValues(left[field], right[field]);
      if (diff !== 0) {
        return direction < 0 ? -diff : diff;
      }
    }
    return compareValues(left.name, right.name);
  });
};

const run = async () => {
  const folders = [
    {
      _id: 'legacy-root',
      name: 'Legacy Root',
      userId: 'user-1'
    },
    {
      _id: 'root-imports',
      name: 'Imports',
      userId: 'user-1',
      parentFolderId: null,
      sortOrder: 2,
      importMeta: {
        provider: 'notion',
        sourceLabel: 'Notion'
      }
    },
    {
      _id: 'child-projects',
      name: 'Projects',
      userId: 'user-1',
      parentFolderId: 'root-imports',
      sortOrder: 1,
      importMeta: {
        provider: 'notion',
        sourceLabel: 'Notion',
        parentExternalId: 'imports'
      }
    }
  ];
  const createdFolders = [];
  let lastSortSpec = null;

  function NotebookFolder(payload = {}) {
    Object.assign(this, payload);
    this._id = this._id || `created-${createdFolders.length + 1}`;
  }

  NotebookFolder.find = () => ({
    sort(sortSpec = {}) {
      lastSortSpec = sortSpec;
      const filtered = folders.filter(folder => String(folder.userId || '') === 'user-1');
      const sorted = sortFolders(filtered, sortSpec);
      return {
        lean: async () => sorted.map(clone)
      };
    }
  });

  NotebookFolder.prototype.save = async function save() {
    const stored = {
      _id: this._id,
      name: this.name,
      userId: this.userId,
      parentFolderId: this.parentFolderId ?? null,
      sortOrder: this.sortOrder ?? 0,
      importMeta: this.importMeta || {}
    };
    createdFolders.push(stored);
    folders.push(stored);
    return this;
  };

  NotebookFolder.findOneAndDelete = async () => null;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-1';
    next();
  });
  app.use(buildNotebookRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
    NotebookEntry: {},
    NotebookFolder,
    ReferenceEdge: {},
    ensureNotebookBlocks: () => {},
    createBlockId: () => 'block-1',
    stripHtml: (value) => String(value || ''),
    normalizeItemType: (value, fallback) => String(value || fallback || '').trim(),
    parseClaimId: () => null,
    normalizeTags: () => [],
    syncNotebookReferences: async () => {},
    enqueueNotebookEmbedding: () => {},
    trackEvent: () => {},
    EVENT_NAMES: {},
    findHighlightById: async () => null
  }));

  const { server, url } = await listen(app);
  try {
    const foldersResponse = await fetch(`${url}/api/notebook/folders`, {
      headers: {
        Authorization: 'Bearer test-token'
      }
    });
    const payload = await foldersResponse.json();

    assert.strictEqual(foldersResponse.status, 200, `GET /api/notebook/folders failed: ${JSON.stringify(payload)}`);
    assert.deepStrictEqual(lastSortSpec, {
      parentFolderId: 1,
      sortOrder: 1,
      name: 1
    });
    assert.deepStrictEqual(
      payload.map((folder) => ({
        id: folder._id,
        name: folder.name,
        parentFolderId: folder.parentFolderId || null,
        sortOrder: folder.sortOrder || 0,
        provider: folder.importMeta?.provider || '',
        parentExternalId: folder.importMeta?.parentExternalId || ''
      })),
      [
        {
          id: 'legacy-root',
          name: 'Legacy Root',
          parentFolderId: null,
          sortOrder: 0,
          provider: '',
          parentExternalId: ''
        },
        {
          id: 'root-imports',
          name: 'Imports',
          parentFolderId: null,
          sortOrder: 2,
          provider: 'notion',
          parentExternalId: ''
        },
        {
          id: 'child-projects',
          name: 'Projects',
          parentFolderId: 'root-imports',
          sortOrder: 1,
          provider: 'notion',
          parentExternalId: 'imports'
        }
      ]
    );

    const createResponse = await fetch(`${url}/api/notebook/folders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        name: 'Nested Drafts',
        parentFolderId: 'root-imports',
        sortOrder: '7',
        importMeta: {
          provider: 'notion',
          sourceLabel: 'Notion',
          externalId: 'nested-drafts',
          parentExternalId: 'root-imports'
        }
      })
    });
    const createdPayload = await createResponse.json();

    assert.strictEqual(createResponse.status, 201, `POST /api/notebook/folders failed: ${JSON.stringify(createdPayload)}`);
    assert.strictEqual(createdPayload.name, 'Nested Drafts');
    assert.strictEqual(createdPayload.parentFolderId, 'root-imports');
    assert.strictEqual(createdPayload.sortOrder, 7);
    assert.strictEqual(createdPayload.importMeta.provider, 'notion');
    assert.strictEqual(createdPayload.importMeta.parentExternalId, 'root-imports');
    assert.strictEqual(createdFolders.length, 1);
    assert.strictEqual(createdFolders[0].parentFolderId, 'root-imports');
    assert.strictEqual(createdFolders[0].sortOrder, 7);
    assert.strictEqual(createdFolders[0].importMeta.externalId, 'nested-drafts');

    const lineageOnlyResponse = await fetch(`${url}/api/notebook/folders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        name: 'Lineage Only',
        importMeta: {
          externalId: 'lineage-only',
          parentExternalId: 'root-imports'
        }
      })
    });
    const lineageOnlyPayload = await lineageOnlyResponse.json();

    assert.strictEqual(lineageOnlyResponse.status, 201, `POST /api/notebook/folders lineage-only failed: ${JSON.stringify(lineageOnlyPayload)}`);
    assert.strictEqual(lineageOnlyPayload.importMeta.externalId, 'lineage-only');
    assert.strictEqual(lineageOnlyPayload.importMeta.parentExternalId, 'root-imports');
    assert.strictEqual(createdFolders[1].importMeta.externalId, 'lineage-only');
    assert.strictEqual(createdFolders[1].importMeta.parentExternalId, 'root-imports');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('notebookRoutes folder tree route test passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
