const assert = require('assert');
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { NotebookEntry } = require('../../models');
const { buildNotebookRouter } = require('../notebookRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({
    server,
    url: `http://127.0.0.1:${server.address().port}`
  }));
});

const putNote = async (url, body) => {
  const response = await fetch(`${url}/api/notebook/note-1`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify(body)
  });
  return { status: response.status, payload: await response.json() };
};

const run = async () => {
  const userId = new mongoose.Types.ObjectId();
  const stored = new NotebookEntry();
  stored.init({
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
    userId,
    title: 'Who gets to experiment, and who pays?',
    content: '<p>Hello</p>',
    blocks: [{ id: 'p1', type: 'paragraph', text: 'Hello' }],
    asidePieces: [{
      nodes: [{ type: 'paragraph', attrs: { blockId: 'held-1' } }],
      blocks: [{ type: 'paragraph', text: 'Held' }]
    }],
    type: 'note',
    tags: [],
    folder: 'inbox',
    linkedHighlightIds: ['64f2000000000000000000aa', 'highlight-1'],
    importMeta: { provider: 'evernote', importSessionId: 'session-evernote' }
  });
  stored.isNew = false;
  stored.$locals = {
    persistedIdentity: {
      linkedHighlightIds: ['64f2000000000000000000aa', 'highlight-1']
    }
  };
  assert.ok(stored.validateSync(), 'leftover identity on the loaded doc should fail until PUT sanitizes it');
  stored.save = async function saveWithSchema() {
    const err = this.validateSync();
    if (err) throw err;
    return this;
  };

  const NotebookEntryModel = {
    findOne: async (query) => (
      String(query?._id) === 'note-1' && String(query?.userId) === String(userId)
        ? stored
        : null
    )
  };

  const app = express();
  app.use(express.json());
  app.use(buildNotebookRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: String(userId) };
      next();
    },
    NotebookEntry: NotebookEntryModel,
    NotebookFolder: {},
    ReferenceEdge: {},
    ensureNotebookBlocks: () => {},
    createBlockId: () => 'block-1',
    stripHtml: (value) => String(value || ''),
    normalizeItemType: (value, fallback) => {
      const candidate = String(value || fallback || '').trim();
      return ['claim', 'evidence', 'note'].includes(candidate) ? candidate : fallback;
    },
    parseClaimId: () => null,
    normalizeTags: (tags) => (Array.isArray(tags) ? tags : []),
    syncNotebookReferences: async () => {
      throw new Error('reference graph unavailable');
    },
    enqueueNotebookEmbedding: () => {},
    trackEvent: () => {},
    EVENT_NAMES: {},
    findHighlightById: async () => null
  }));

  const unsanitized = new NotebookEntry({
    userId,
    title: 'Who gets to experiment, and who pays?',
    content: '',
    blocks: [{
      id: 'quote-1',
      type: 'quote',
      text: 'The cost is borne by people who did not volunteer.',
      articleId: 'article-1',
      articleTitle: 'A beautiful source',
      sourcePath: '/library?articleId=article-1#passage=exact'
    }],
    type: 'note'
  });
  const previousFailureMode = unsanitized.validateSync();
  assert.ok(previousFailureMode, 'slug articleId should fail schema validation');
  assert.match(String(previousFailureMode), /articleId/);

  const { server, url } = await listen(app);
  try {
    const typing = await putNote(url, {
      id: 'note-1',
      title: 'Who gets to experiment, and who pays?',
      content: '<p>Recoverable mistakes belong to the person who can still put things back.</p>',
      blocks: [{
        id: 'rule',
        type: 'paragraph',
        text: 'Recoverable mistakes belong to the person who can still put things back.'
      }],
      type: 'note',
      tags: [],
      claimId: null,
      linkedArticleId: null
    });
    assert.strictEqual(typing.status, 200, `typing save failed: ${JSON.stringify(typing.payload)}`);
    assert.strictEqual(typing.payload.error, undefined);
    assert.equal(
      stored.blocks[0].text,
      'Recoverable mistakes belong to the person who can still put things back.'
    );
    assert.equal(stored.folder, null);
    assert.deepEqual(stored.linkedHighlightIds.map(String), ['64f2000000000000000000aa']);
    assert.equal(stored.importMeta.importSessionId, null);
    assert.equal(stored.asidePieces[0].id, 'held-1');
    assert.equal(stored.validateSync(), null);

    const previousFailure = await putNote(url, {
      title: 'Who gets to experiment, and who pays?',
      content: '<p>The exception.</p>',
      blocks: [
        {
          id: 'exception',
          type: 'paragraph',
          text: 'The exception is when the downside lands on someone who never chose the experiment.'
        },
        {
          id: 'quote-1',
          type: 'quote',
          text: 'The cost is borne by people who did not volunteer.',
          articleId: 'article-1',
          articleTitle: 'A beautiful source',
          sourcePath: '/library?articleId=article-1#passage=exact'
        }
      ],
      asidePieces: [{
        id: 'held',
        label: 'A discarded draft opening',
        index: 0,
        nodes: [{
          type: 'paragraph',
          attrs: { blockId: 'held-1' },
          content: [{ type: 'text', text: 'This must not leave the workshop.' }]
        }],
        blocks: [{
          id: 'held-1',
          type: 'quote',
          text: 'A line kept aside',
          articleId: 'article-1',
          articleTitle: 'A beautiful source',
          sourcePath: '/library?articleId=article-1#passage=exact'
        }]
      }],
      type: 'note',
      tags: [],
      claimId: null,
      linkedArticleId: null
    });
    assert.strictEqual(
      previousFailure.status,
      200,
      `source quote save failed: ${JSON.stringify(previousFailure.payload)}`
    );
    assert.strictEqual(previousFailure.payload.error, undefined);
    assert.equal(stored.blocks[1].articleTitle, 'A beautiful source');
    assert.equal(stored.blocks[1].sourcePath, '/library?articleId=article-1#passage=exact');
    assert.equal(stored.blocks[1].articleId, null);
    assert.equal(stored.asidePieces[0].nodes[0].attrs.blockId, 'held-1');
    assert.equal(stored.asidePieces[0].blocks[0].articleId, null);
  } finally {
    server.close();
  }
};

run().then(() => {
  console.log('notebook update tests passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
