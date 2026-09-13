const assert = require('assert');
const express = require('express');
const http = require('http');
const { buildNotebookRouter } = require('../notebookRoutes');
const { hashPublicNotebook, projectPublicNotebook } = require('../../services/authoredNotebookShare');

const USER = '64f200000000000000000001';
const NOTE = '64f2000000000000000000cc';
const ARTICLE = '64f2000000000000000000bb';
const OLD = 'Two hours a week cannot sustain this.';
const NEW = 'The exception arrives first.';

const listen = (app) => new Promise((resolve) => {
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => resolve({
    server,
    url: `http://127.0.0.1:${server.address().port}`
  }));
});

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_error) {
    body = text;
  }
  return { response, body };
};

const essay = () => ({
  _id: NOTE,
  userId: USER,
  title: 'Who gets to experiment, and who pays?',
  blocks: [{
    id: 'q1',
    type: 'highlight_embed',
    highlightId: '64f2000000000000000000aa',
    articleId: ARTICLE,
    articleTitle: 'A letter on time',
    text: OLD,
    sourcePath: `/library?articleId=${ARTICLE}`
  }, {
    id: 'p1',
    type: 'paragraph',
    text: NEW
  }]
});

const run = async () => {
  const entry = essay();
  const shares = [];
  const letters = [];
  const matchShare = (row, query) => Object.entries(query).every(([key, value]) => (
    String(row[key]) === String(value)
  ));
  const matchLetter = (row, query) => Object.entries(query || {}).every(([key, value]) => (
    String(row[key]) === String(value)
  ));

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
        String(query?._id) === NOTE && String(query?.userId) === USER
          ? { ...entry, toObject() { return { ...entry }; } }
          : null
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
    Article: {
      find: () => ({
        select() {
          return {
            lean: async () => [{ _id: ARTICLE, url: 'https://example.com/letter', title: 'A letter on time' }]
          };
        }
      })
    },
    User: {
      findById: () => ({
        select() {
          return { lean: async () => ({ displayName: 'Athan' }) };
        }
      })
    },
    SharedNotebook: {
      findOne: (query) => ({
        lean: async () => shares.find((row) => matchShare(row, query)) || null
      }),
      create: async (doc) => {
        if (shares.some((row) => String(row.userId) === String(doc.userId)
          && String(row.notebookId) === String(doc.notebookId))) {
          const error = new Error('E11000 duplicate key');
          error.code = 11000;
          throw error;
        }
        const row = { ...doc };
        shares.push(row);
        return row;
      },
      findOneAndUpdate: async (query, patch) => {
        const row = shares.find((entryRow) => matchShare(entryRow, query));
        if (!row) return null;
        Object.assign(row, patch.$set || patch);
        return row;
      },
      deleteOne: async (query) => {
        const index = shares.findIndex((row) => matchShare(row, query));
        if (index !== -1) shares.splice(index, 1);
        return { deletedCount: index === -1 ? 0 : 1 };
      }
    },
    NotebookCorrespondence: {
      find: (query) => ({
        sort: () => ({
          lean: async () => letters.filter((row) => matchLetter(row, query))
        })
      }),
      countDocuments: async (query) => letters.filter((row) => matchLetter(row, query)).length,
      create: async (doc) => {
        const row = {
          _id: `letter-${letters.length + 1}`,
          createdAt: new Date('2026-09-13T16:00:00.000Z'),
          ...doc
        };
        letters.push(row);
        return row;
      }
    }
  }));

  const { server, url } = await listen(app);
  const share = (method = 'GET', body) => fetchJson(`${url}/api/notebook/${NOTE}/share`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });

  try {
    const before = await share();
    assert.strictEqual(before.response.status, 200, JSON.stringify(before.body));
    assert.strictEqual(before.body.shared, false);
    assert.strictEqual(before.body.publishable, true);
    assert.strictEqual(before.body.preview.blocks[0].source.href, 'https://example.com/letter');
    assert.ok(!JSON.stringify(before.body.preview).includes('/library?'));
    assert.ok(!JSON.stringify(before.body.preview).includes(ARTICLE));

    const agent = await fetchJson(`${url}/api/notebook/${NOTE}/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-token': '1' },
      body: JSON.stringify({ previewHash: before.body.currentHash })
    });
    assert.strictEqual(agent.response.status, 403);
    assert.strictEqual(shares.length, 0);

    const created = await share('POST', { previewHash: before.body.currentHash });
    assert.strictEqual(created.response.status, 201, JSON.stringify(created.body));
    assert.strictEqual(created.body.shared, true);
    assert.ok(created.body.slug);
    assert.deepStrictEqual(created.body.letters, []);
    assert.strictEqual(created.body.snapshot.blocks[0].text, OLD);
    assert.strictEqual(created.body.snapshot.blocks[0].source.href, 'https://example.com/letter');
    const slug = created.body.slug;

    const again = await share('POST', { previewHash: created.body.currentHash });
    assert.strictEqual(again.response.status, 200);
    assert.strictEqual(again.body.slug, slug);
    assert.strictEqual(shares.length, 1);

    const publicRead = await fetchJson(`${url}/api/public/notebooks/${slug}`);
    assert.strictEqual(publicRead.response.status, 200);
    assert.strictEqual(publicRead.body.title, 'Who gets to experiment, and who pays?');
    assert.strictEqual(publicRead.body.ownerDisplayName, 'Athan');
    assert.ok(publicRead.body.publishedAt);
    assert.ok(!publicRead.body.revisedAt);
    assert.ok(!publicRead.body.correction);
    assert.ok(!publicRead.body.letters);
    assert.ok(!JSON.stringify(publicRead.body).includes('/library?'));
    assert.strictEqual(publicRead.response.headers.get('cache-control').includes('no-store'), true);

    const asked = await fetchJson(`${url}/api/public/notebooks/${slug}/correspondence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        blockId: 'q1',
        text: '  <em>Does spare time belong to the person who pays?</em>  '
      })
    });
    assert.strictEqual(asked.response.status, 201, JSON.stringify(asked.body));
    assert.deepStrictEqual(asked.body, { sent: true });
    assert.strictEqual(letters.length, 1);
    assert.strictEqual(letters[0].text, 'Does spare time belong to the person who pays?');
    assert.strictEqual(letters[0].excerpt, OLD);
    assert.ok(!JSON.stringify(asked.body).includes(OLD));

    const headingAsk = await fetchJson(`${url}/api/public/notebooks/${slug}/correspondence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blockId: 'missing', text: 'Why?' })
    });
    assert.strictEqual(headingAsk.response.status, 400);

    const emptyAsk = await fetchJson(`${url}/api/public/notebooks/${slug}/correspondence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blockId: 'q1', text: '   ' })
    });
    assert.strictEqual(emptyAsk.response.status, 400);

    const afterAsk = await share();
    assert.strictEqual(afterAsk.body.letters.length, 1);
    assert.strictEqual(afterAsk.body.letters[0].text, 'Does spare time belong to the person who pays?');
    assert.strictEqual(afterAsk.body.letters[0].excerpt, OLD);
    const stillPublic = await fetchJson(`${url}/api/public/notebooks/${slug}`);
    assert.ok(!stillPublic.body.letters);
    assert.ok(!JSON.stringify(stillPublic.body).includes('Does spare time belong'));

    entry.blocks[1].text = 'Rewritten in the workshop.';
    const status = await share();
    assert.strictEqual(status.body.shared, true);
    assert.strictEqual(status.body.stale, true);
    assert.strictEqual(status.body.snapshot.blocks[1].text, NEW);

    const staleUpdate = await share('PUT', { previewHash: created.body.currentHash });
    assert.strictEqual(staleUpdate.response.status, 409);

    const firstPublished = created.body.snapshot.publishedAt;
    const updated = await share('PUT', {
      previewHash: status.body.currentHash,
      correction: 'The exception now leads.'
    });
    assert.strictEqual(updated.response.status, 200, JSON.stringify(updated.body));
    assert.strictEqual(updated.body.stale, false);
    assert.strictEqual(updated.body.slug, slug);
    const afterUpdate = await fetchJson(`${url}/api/public/notebooks/${slug}`);
    assert.strictEqual(afterUpdate.body.blocks[1].text, 'Rewritten in the workshop.');
    assert.strictEqual(afterUpdate.body.publishedAt, firstPublished);
    assert.ok(afterUpdate.body.revisedAt);
    assert.notStrictEqual(afterUpdate.body.revisedAt, firstPublished);
    assert.strictEqual(afterUpdate.body.correction, 'The exception now leads.');

    entry.blocks[1].text = 'Rewritten again.';
    const movedAgain = await share();
    const cleared = await share('PUT', {
      previewHash: movedAgain.body.currentHash,
      correction: ''
    });
    assert.strictEqual(cleared.response.status, 200, JSON.stringify(cleared.body));
    const afterClear = await fetchJson(`${url}/api/public/notebooks/${slug}`);
    assert.strictEqual(afterClear.body.publishedAt, firstPublished);
    assert.ok(!afterClear.body.correction);

    const emptyEntry = { ...essay(), blocks: [], content: '' };
    Object.assign(entry, emptyEntry);
    const empty = await share('POST', { previewHash: hashPublicNotebook(projectPublicNotebook(emptyEntry, 'Athan')) });
    assert.strictEqual(empty.response.status, 409);
    assert.strictEqual(empty.body.error, 'Nothing to share yet.');

    Object.assign(entry, essay());
    const revoked = await share('DELETE');
    assert.strictEqual(revoked.response.status, 200);
    assert.strictEqual(revoked.body.revoked, true);
    const gone = await fetchJson(`${url}/api/public/notebooks/${slug}`);
    assert.strictEqual(gone.response.status, 404);
    const missing = await fetchJson(`${url}/api/public/notebooks/no-such-slug`);
    assert.strictEqual(missing.response.status, 404);
    assert.deepStrictEqual(gone.body, missing.body);
    const closedDoor = await fetchJson(`${url}/api/public/notebooks/${slug}/correspondence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blockId: 'q1', text: 'A later question.' })
    });
    assert.strictEqual(closedDoor.response.status, 404);
    assert.deepStrictEqual(closedDoor.body, gone.body);
    Object.assign(entry, essay());
    const kept = await share();
    assert.strictEqual(kept.body.shared, false);
    assert.strictEqual(kept.body.letters.length, 1);
    assert.strictEqual(kept.body.letters[0].text, 'Does spare time belong to the person who pays?');
  } finally {
    server.close();
  }
};

run().then(() => {
  console.log('notebookRoutes.share tests passed');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
