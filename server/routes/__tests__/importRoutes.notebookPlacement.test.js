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

const matchesQuery = (doc, query = {}) => Object.entries(query || {}).every(([key, expected]) => {
  const actual = key.split('.').reduce((current, segment) => (
    current && current[segment] !== undefined ? current[segment] : undefined
  ), doc);
  return String(actual ?? '') === String(expected ?? '');
});

const pickFields = (doc, fields = '') => {
  if (!doc) return null;
  const picked = {};
  String(fields || '')
    .split(/\s+/)
    .map(field => field.trim())
    .filter(Boolean)
    .forEach((field) => {
      if (doc[field] !== undefined) {
        picked[field] = doc[field];
      }
    });
  if (doc._id !== undefined) picked._id = doc._id;
  return picked;
};

const createNotebookEntryModel = (seedEntries = []) => {
  const store = new Map();
  let idCounter = seedEntries.length;

  function attachDocument(entry) {
    const document = {
      ...clone(entry),
      async save() {
        if (!this._id) {
          idCounter += 1;
          this._id = `entry-${idCounter}`;
        }
        store.set(String(this._id), this);
        return this;
      },
      toObject() {
        return clone(this);
      }
    };
    store.set(String(document._id), document);
    return document;
  }

  seedEntries.forEach(entry => attachDocument(entry));

  const resolveOne = (query = {}) => {
    for (const entry of store.values()) {
      if (matchesQuery(entry, query)) {
        return entry;
      }
    }
    return null;
  };

  function NotebookEntry(payload = {}) {
    Object.assign(this, clone(payload));
    if (!this._id) {
      idCounter += 1;
      this._id = `entry-${idCounter}`;
    }
  }

  NotebookEntry.prototype.save = async function save() {
    attachDocument(this);
    return this;
  };

  NotebookEntry.findOne = (query = {}) => ({
    select: async (fields) => pickFields(resolveOne(query), fields),
    lean: async () => {
      const found = resolveOne(query);
      return found ? clone(found) : null;
    },
    then(resolve, reject) {
      return Promise.resolve(resolveOne(query)).then(resolve, reject);
    }
  });

  NotebookEntry.findOneAndUpdate = async (query = {}, updates = {}, options = {}) => {
    const entry = resolveOne(query);
    if (!entry) return null;
    Object.assign(entry, clone(updates));
    await entry.save();
    return options?.new ? entry : null;
  };

  NotebookEntry.findById = async (id) => resolveOne({ _id: id });
  NotebookEntry.updateMany = async () => ({ acknowledged: true });
  NotebookEntry.all = () => Array.from(store.values()).map(clone);

  return NotebookEntry;
};

const buildImportSessionStore = () => {
  const session = {
    _id: 'session-evernote',
    userId: 'user-1',
    provider: 'evernote',
    status: 'draft',
    sourceLabel: 'Evernote ENEX',
    progress: {
      stage: 'draft',
      percent: 0,
      indexingState: 'not_started'
    },
    preview: {},
    result: {},
    activation: {},
    lastError: '',
    async save() {
      return this;
    }
  };

  return {
    session,
    async findOne(query = {}) {
      return String(query?._id || '') === session._id && String(query?.userId || '') === session.userId
        ? session
        : null;
    }
  };
};

const run = async () => {
  const notebookImportTreeService = require('../../services/notebookImportTreeService');
  const originalEnsureNotebookImportFolderPath = notebookImportTreeService.ensureNotebookImportFolderPath;
  notebookImportTreeService.ensureNotebookImportFolderPath = async ({
    sourceLabel = '',
    sourcePath = []
  } = {}) => ({
    folder: { _id: 'imports-root' },
    createdFolders: [],
    sourcePath: [sourceLabel, ...(Array.isArray(sourcePath) ? sourcePath : [])]
      .map(segment => String(segment || '').trim())
      .filter(Boolean)
      .join(' / ')
  });
  delete require.cache[require.resolve('../importRoutes')];
  const { buildImportRouter } = require('../importRoutes');

  const syncCalls = [];
  const embeddingCalls = [];
  const NotebookEntry = createNotebookEntryModel([{
    _id: 'entry-1',
    title: 'Imported Note',
    content: '<p>Old content</p>',
    blocks: [{
      id: 'block-1',
      type: 'paragraph',
      text: 'Old content'
    }],
    folder: 'imports-root',
    tags: ['evernote-import'],
    userId: 'user-1',
    importMeta: {
      provider: 'evernote',
      sourceType: 'enex',
      sourceLabel: 'Evernote Backup.enex',
      sourcePath: 'Evernote Backup',
      folderOwnership: 'import_mirror',
      externalId: 'imported-note-1',
      importSessionId: 'initial-session',
      importedAt: '2026-04-18T00:00:00.000Z'
    }
  }]);
  const importSessions = buildImportSessionStore();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    req.requestId = 'req-1';
    next();
  });
  const authenticateToken = (req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  };

  app.use(buildNotebookRouter({
    authenticateToken,
    NotebookEntry,
    NotebookFolder: {},
    ReferenceEdge: {
      deleteMany: async () => ({ acknowledged: true })
    },
    ensureNotebookBlocks: () => {},
    createBlockId: () => 'created-block',
    stripHtml: (value) => String(value || '').replace(/<[^>]+>/g, '').trim(),
    normalizeItemType: (value, fallback) => String(value || fallback || '').trim(),
    parseClaimId: (value) => value || null,
    normalizeTags: (tags) => Array.isArray(tags) ? tags : [],
    syncNotebookReferences: async (userId, entryId, blocks) => {
      syncCalls.push({
        route: 'notebook',
        userId,
        entryId: String(entryId),
        blockTexts: (blocks || []).map(block => block.text)
      });
    },
    enqueueNotebookEmbedding: (entry) => {
      embeddingCalls.push({
        route: 'notebook',
        entryId: String(entry?._id || '')
      });
    },
    trackEvent: () => {},
    EVENT_NAMES: {},
    findHighlightById: async () => null
  }));

  app.use(buildImportRouter({
    authenticateToken,
    upload: {
      single: () => (req, _res, next) => {
        if (req.body?.enex) {
          req.file = {
            originalname: req.body.filename || 'Evernote Backup.enex',
            buffer: Buffer.from(String(req.body.enex), 'utf8')
          };
        }
        next();
      }
    },
    Papa: {},
    findRowValue: () => '',
    slugify: (value = '') => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    parseTagList: () => [],
    Article: {},
    trackEvent: () => {},
    EVENT_NAMES: {
      CAPTURE_COMPLETED: 'capture_completed'
    },
    path: require('path'),
    crypto: require('crypto'),
    TagMeta: {},
    NotebookEntry,
    ImportSession: importSessions,
    IntegrationConnection: {},
    syncNotebookReferences: async (userId, entryId, blocks) => {
      syncCalls.push({
        route: 'import',
        userId,
        entryId: String(entryId),
        blockTexts: (blocks || []).map(block => block.text)
      });
    },
    enqueueArticleEmbedding: () => {},
    enqueueHighlightEmbedding: () => {},
    enqueueNotebookEmbedding: (entry) => {
      embeddingCalls.push({
        route: 'import',
        entryId: String(entry?._id || '')
      });
    }
  }));

  const { server, url } = await listen(app);
  try {
    const moveResponse = await fetch(`${url}/api/notebook/entry-1`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        folder: 'user-folder'
      })
    });
    const movePayload = await moveResponse.json();

    assert.strictEqual(moveResponse.status, 200, `Moving imported note failed: ${JSON.stringify(movePayload)}`);
    assert.strictEqual(movePayload.folder, 'user-folder');
    assert.strictEqual(movePayload.importMeta.folderOwnership, 'user_owned', 'Moving an imported note should mark folder placement as user-owned.');

    const syncResponse = await fetch(`${url}/api/import/evernote-enex`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        importSessionId: 'session-evernote',
        filename: 'Evernote Backup.enex',
        enex: `<?xml version="1.0" encoding="UTF-8"?>
<en-export>
  <note>
    <title>Imported Note</title>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><en-note><div>Fresh content</div><div>- New bullet</div></en-note>]]></content>
    <updated>20260419T120000Z</updated>
    <tag>updated</tag>
  </note>
</en-export>`
      })
    });
    const syncPayload = await syncResponse.json();

    assert.strictEqual(syncResponse.status, 200, `Evernote resync failed: ${JSON.stringify(syncPayload)}`);
    assert.strictEqual(syncPayload.importedNotes, 1, 'Resync should count the matched note as synced.');
    assert.strictEqual(syncPayload.duplicateSkips, 0, 'Resync should update the existing entry instead of skipping it as a duplicate.');

    const storedEntry = await NotebookEntry.findById('entry-1');
    assert(storedEntry, 'The imported notebook entry should still exist after resync.');
    assert.strictEqual(storedEntry.folder, 'user-folder', 'Resync should preserve the user-selected folder.');
    assert.strictEqual(storedEntry.importMeta.folderOwnership, 'user_owned', 'Resync should preserve the user-owned placement marker.');
    assert.strictEqual(storedEntry.content.includes('Fresh content'), true, 'Resync should refresh notebook content in place.');
    assert.strictEqual(storedEntry.blocks.some(block => block.text === 'Fresh content'), true, 'Resync should refresh notebook blocks in place.');
    assert.strictEqual(syncCalls.some(call => call.route === 'import' && call.entryId === 'entry-1' && call.blockTexts.includes('Fresh content')), true, 'Resync should re-sync notebook references when content changes.');
    assert.strictEqual(embeddingCalls.some(call => call.route === 'import' && call.entryId === 'entry-1'), true, 'Resync should re-queue notebook embedding for the updated entry.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    notebookImportTreeService.ensureNotebookImportFolderPath = originalEnsureNotebookImportFolderPath;
    delete require.cache[require.resolve('../importRoutes')];
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('importRoutes notebook placement route test passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
