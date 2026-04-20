const assert = require('assert');
const express = require('express');
const http = require('http');

const notebookEntryToEmbeddingItems = require('../../ai/mappers/notebookEntryToEmbeddingItems');

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
    lean: async () => {
      const found = resolveOne(query);
      return found ? clone(found) : null;
    },
    then(resolve, reject) {
      return Promise.resolve(resolveOne(query)).then(resolve, reject);
    }
  });

  NotebookEntry.findById = async (id) => resolveOne({ _id: id });

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
    title: 'Imported Research Note',
    content: '<p>Original imported insight</p>',
    blocks: [{
      id: 'block-1',
      type: 'paragraph',
      text: 'Original imported insight'
    }],
    folder: 'imports-root',
    tags: ['evernote-import', 'retrieval'],
    userId: 'user-1',
    importMeta: {
      provider: 'evernote',
      sourceType: 'enex',
      sourceLabel: 'Evernote Backup.enex',
      sourcePath: 'Evernote Backup',
      sourceUrl: 'evernote:///view/entry-1',
      folderOwnership: 'import_mirror',
      externalId: 'imported-research-note-1',
      importSessionId: 'initial-session',
      importedAt: '2026-04-18T00:00:00.000Z',
      searchableAt: '2026-04-19T09:15:00.000Z'
    },
    createdAt: '2026-04-18T00:00:00.000Z',
    updatedAt: '2026-04-19T09:15:00.000Z'
  }]);
  const importSessions = buildImportSessionStore();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, _res, next) => {
    req.requestId = 'req-1';
    next();
  });

  app.use(buildImportRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    },
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
        userId,
        entryId: String(entryId),
        blockTexts: (blocks || []).map(block => block.text)
      });
    },
    enqueueArticleEmbedding: () => {},
    enqueueHighlightEmbedding: () => {},
    enqueueNotebookEmbedding: (entry) => {
      embeddingCalls.push(String(entry?._id || ''));
    }
  }));

  const { server, url } = await listen(app);
  try {
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
    <title>Imported Research Note</title>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><en-note><div>Imported insight refreshed for retrieval.</div><div>- Notebook references stay queryable</div></en-note>]]></content>
    <updated>20260419T114500Z</updated>
    <tag>retrieval</tag>
    <tag>evernote-import</tag>
  </note>
</en-export>`
      })
    });
    const syncPayload = await syncResponse.json();

    assert.strictEqual(syncResponse.status, 200, `Evernote resync failed: ${JSON.stringify(syncPayload)}`);
    assert.strictEqual(syncPayload.importedNotes, 1, 'Resync should count the matched imported note.');
    assert.strictEqual(syncPayload.duplicateSkips, 0, 'Resync should update the existing imported note instead of skipping it.');
    assert.strictEqual(
      syncCalls.some(call => call.entryId === 'entry-1' && call.blockTexts.includes('Imported insight refreshed for retrieval.')),
      true,
      'Evernote resync should re-sync notebook references for the updated imported note.'
    );
    assert.strictEqual(
      embeddingCalls.includes('entry-1'),
      true,
      'Evernote resync should re-queue notebook embeddings for the updated imported note.'
    );

    const storedEntry = await NotebookEntry.findById('entry-1');
    assert(storedEntry, 'The imported notebook entry should still exist after resync.');
    assert.strictEqual(storedEntry.content.includes('Imported insight refreshed for retrieval.'), true, 'Resync should refresh imported notebook content.');
    assert.strictEqual(storedEntry.blocks.some(block => block.text === 'Imported insight refreshed for retrieval.'), true, 'Resync should refresh imported notebook blocks.');

    const embeddingItems = notebookEntryToEmbeddingItems(storedEntry, 'user-1');
    assert.strictEqual(embeddingItems.length, 2, 'Updated imported note should emit embedding items for its refreshed blocks.');
    assert.deepStrictEqual(
      embeddingItems[0].metadata.sourcePathSegments,
      ['Evernote Backup'],
      'Embedding metadata should normalize Evernote sourcePath from the saved entry state.'
    );
    assert.strictEqual(
      embeddingItems[0].metadata.folderPath,
      'Evernote Backup',
      'Embedding metadata should expose the saved mirrored folder path for diagnostics.'
    );
    assert.strictEqual(
      embeddingItems[0].metadata.sourceLabel,
      'Evernote Backup.enex',
      'Embedding metadata should preserve the import source label from the saved entry.'
    );
    assert.strictEqual(
      embeddingItems[0].metadata.searchableAt,
      '2026-04-19T09:15:00.000Z',
      'Embedding metadata should preserve notebook searchableAt from saved import metadata when resync does not replace it.'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    notebookImportTreeService.ensureNotebookImportFolderPath = originalEnsureNotebookImportFolderPath;
    delete require.cache[require.resolve('../importRoutes')];
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('importRoutes notebook retrieval test passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
