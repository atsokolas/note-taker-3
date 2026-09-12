const assert = require('assert');
const express = require('express');
const http = require('http');
const { buildNotebookRouter } = require('../notebookRoutes');

const USER = '64f200000000000000000001';
const NOTE = '64f2000000000000000000cc';
const HIGHLIGHT = '64f2000000000000000000aa';
const EVENT = '64f2000000000000000000dd';
const OLD = 'Two hours a week can sustain this.';
const NEW = 'Two hours a week cannot sustain this.';

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({
    server,
    url: `http://127.0.0.1:${server.address().port}`
  }));
});

const run = async () => {
  const entry = {
    _id: NOTE,
    userId: USER,
    title: 'Who gets to experiment',
    blocks: [{
      id: 'block-quote',
      type: 'highlight_embed',
      highlightId: HIGHLIGHT,
      articleId: '64f2000000000000000000bb',
      articleTitle: 'A letter on time',
      text: OLD
    }, {
      id: 'block-prose',
      type: 'paragraph',
      text: 'The work still depends on two hours.'
    }],
    toObject() {
      return { ...this, toObject: undefined, save: undefined, markModified: undefined };
    },
    markModified() {},
    async save() { return this; }
  };
  const events = [{
    _id: EVENT,
    userId: USER,
    sourceType: 'highlight',
    sourceObjectId: HIGHLIGHT,
    text: NEW,
    title: 'A letter on time',
    createdAt: new Date('2026-09-11T15:00:00.000Z'),
    sourceUpdatedAt: new Date('2026-09-11T15:00:00.000Z'),
    metadata: {
      kind: 'source_correction',
      previousText: OLD,
      correctionIdentity: 'identity-1'
    }
  }];
  const receipts = new Map();
  const WikiSourceEvent = {
    find(query) {
      const rows = events.filter((row) => String(row.userId) === String(query.userId)
        && String(row.metadata?.kind) === 'source_correction'
        && query.sourceObjectId.$in.map(String).includes(String(row.sourceObjectId)));
      const api = {
        sort() { return api; },
        lean: async () => rows
      };
      api.then = (resolve, reject) => Promise.resolve(rows).then(resolve, reject);
      return api;
    }
  };
  const NoeisReceipt = {
    findOne: async ({ receiptId }) => receipts.get(receiptId) || null,
    findOneAndUpdate: async (_query, { $set }) => {
      const stored = { ...$set };
      receipts.set(stored.receiptId, stored);
      return stored;
    }
  };
  const app = express();
  app.use(express.json());
  app.use(buildNotebookRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: USER };
      if (req.headers['x-agent-token']) req.agentToken = true;
      next();
    },
    NotebookEntry: {
      findOne: async (query) => (
        String(query?._id) === NOTE && String(query?.userId) === USER ? entry : null
      )
    },
    NotebookFolder: {},
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
    findHighlightById: async () => null,
    WikiSourceEvent,
    NoeisReceipt
  }));

  const { server, url } = await listen(app);
  try {
    const opened = await fetch(`${url}/api/notebook/${NOTE}`);
    const openedBody = await opened.json();
    assert.strictEqual(opened.status, 200, JSON.stringify(openedBody));
    assert.strictEqual(openedBody.sourceCorrection.eventId, EVENT);
    assert.strictEqual(openedBody.sourceCorrection.oldQuotation, OLD);
    assert.strictEqual(openedBody.sourceCorrection.newEvidence, NEW);
    assert.strictEqual(openedBody.sourceCorrection.ui, 'review');

    const forbidden = await fetch(`${url}/api/notebook/${NOTE}/source-correction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-token': '1' },
      body: JSON.stringify({ eventId: EVENT, action: 'change' })
    });
    assert.strictEqual(forbidden.status, 403);

    const settled = await fetch(`${url}/api/notebook/${NOTE}/source-correction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId: EVENT, action: 'no_change' })
    });
    const settledBody = await settled.json();
    assert.strictEqual(settled.status, 200, JSON.stringify(settledBody));
    assert.strictEqual(settledBody.receipt.provenance.disposition, 'no_change');
    assert.strictEqual(settledBody.receipt.provenance.writingRewritten, false);
    assert.strictEqual(settledBody.sourceCorrection.ui, 'settled');
    assert.strictEqual(entry.blocks[0].text, OLD);
    assert.strictEqual(entry.blocks[1].text, 'The work still depends on two hours.');
  } finally {
    server.close();
  }
};

run().then(() => {
  console.log('notebookRoutes.sourceCorrection tests passed');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
