const assert = require('assert');
const express = require('express');
const http = require('http');
const { buildNotebookVolumeRouter } = require('../notebookVolumeRoutes');
const { hashPublicVolume } = require('../../services/authoredNotebookVolume');

const USER = '64f200000000000000000001';
const NOTE_A = '64f2000000000000000000aa';
const NOTE_B = '64f2000000000000000000bb';
const NOTE_C = '64f2000000000000000000cc';

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

const essay = (id, title, extra = {}) => ({
  userId: USER,
  notebookId: id,
  slug: `slug-${id.slice(-2)}`,
  ownerDisplayName: 'Athan',
  snapshot: {
    title,
    ownerDisplayName: 'Athan',
    publishedAt: extra.publishedAt || '2026-09-12T12:00:00.000Z',
    blocks: [{
      id: 'q1',
      type: 'quote',
      text: extra.quote || 'Two hours a week cannot sustain this.',
      source: {
        title: 'A letter on time',
        href: 'https://example.com/letter',
        access: 'open'
      }
    }, {
      id: 'h1',
      type: 'heading',
      level: 2,
      text: extra.heading || 'The exception first'
    }, {
      id: 'p1',
      type: 'paragraph',
      text: extra.paragraph || 'The exception arrives first.'
    }]
  },
  contentHash: 'hash'
});

const run = async () => {
  const shares = [
    essay(NOTE_A, 'Who gets to experiment, and who pays?'),
    essay(NOTE_B, 'Whose downside?', {
      publishedAt: '2026-09-13T12:00:00.000Z',
      quote: 'A different door.',
      heading: 'The cost',
      paragraph: 'The cost lands on someone who did not choose.'
    })
  ];
  const volumes = [];
  const match = (row, query) => Object.entries(query || {}).every(([key, value]) => {
    if (key === 'snapshot' && value && value.$ne === null) return row.snapshot != null;
    return String(row[key]) === String(value);
  });

  const app = express();
  app.use(express.json());
  app.use(buildNotebookVolumeRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: USER };
      if (req.headers['x-agent-token']) req.agentToken = true;
      next();
    },
    User: {
      findById: () => ({
        select() {
          return { lean: async () => ({ displayName: 'Athan' }) };
        }
      })
    },
    SharedNotebook: {
      find: (query) => ({
        lean: async () => shares.filter((row) => match(row, query))
      }),
      findOne: (query) => ({
        lean: async () => shares.find((row) => match(row, query)) || null
      })
    },
    SharedNotebookVolume: {
      findOne: (query) => ({
        lean: async () => volumes.find((row) => match(row, query)) || null
      }),
      create: async (doc) => {
        if (volumes.some((row) => String(row.userId) === String(doc.userId))) {
          const error = new Error('E11000 duplicate key');
          error.code = 11000;
          throw error;
        }
        const row = { ...doc };
        volumes.push(row);
        return row;
      },
      findOneAndUpdate: async (query, patch) => {
        const row = volumes.find((entry) => match(entry, query));
        if (!row) return null;
        Object.assign(row, patch.$set || patch);
        return row;
      },
      deleteOne: async (query) => {
        const index = volumes.findIndex((row) => match(row, query));
        if (index !== -1) volumes.splice(index, 1);
        return { deletedCount: index === -1 ? 0 : 1 };
      }
    }
  }));

  const { server, url } = await listen(app);
  const owner = (method = 'GET', body) => fetchJson(`${url}/api/volumes`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });

  try {
    const empty = await owner();
    assert.strictEqual(empty.response.status, 200);
    assert.strictEqual(empty.body.shared, false);
    assert.strictEqual(empty.body.publishable, false);
    assert.strictEqual(empty.body.catalog.length, 2);

    const agent = await fetchJson(`${url}/api/volumes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-token': '1' },
      body: JSON.stringify({
        title: 'Who pays?',
        introduction: 'Two finished notes, one question.',
        notebookIds: [NOTE_A, NOTE_B],
        previewHash: empty.body.currentHash
      })
    });
    assert.strictEqual(agent.response.status, 403);

    const one = await owner('POST', {
      title: 'Who pays?',
      introduction: 'Two finished notes, one question.',
      notebookIds: [NOTE_A],
      previewHash: empty.body.currentHash
    });
    assert.strictEqual(one.response.status, 409);
    assert.strictEqual(one.body.error, 'Share at least two notes first.');

    const silent = await owner('POST', {
      title: 'Who pays?',
      introduction: '',
      notebookIds: [NOTE_A, NOTE_B],
      previewHash: empty.body.currentHash
    });
    assert.strictEqual(silent.response.status, 409);

    const ready = await fetchJson(`${url}/api/volumes?notebookIds=${NOTE_A},${NOTE_B}&title=${encodeURIComponent('Who pays?')}&introduction=${encodeURIComponent('Two finished notes, one question.')}`);
    assert.strictEqual(ready.body.publishable, true);
    const created = await owner('POST', {
      title: 'Who pays?',
      introduction: 'Two finished notes, one question.',
      notebookIds: [NOTE_A, NOTE_B],
      previewHash: ready.body.currentHash
    });
    assert.strictEqual(created.response.status, 201, JSON.stringify(created.body));
    assert.strictEqual(created.body.shared, true);
    assert.ok(created.body.slug);
    assert.strictEqual(created.body.snapshot.pieces.length, 2);
    assert.strictEqual(created.body.snapshot.contents[0].ideas[0], 'The exception first');
    assert.strictEqual(created.body.snapshot.sources[0].href, 'https://example.com/letter');
    assert.ok(!JSON.stringify(created.body.snapshot).includes(NOTE_A));
    assert.ok(!JSON.stringify(created.body.snapshot).includes('/library?'));
    const slug = created.body.slug;
    const firstPublished = created.body.snapshot.publishedAt;

    const again = await owner('POST', {
      title: 'Ignored',
      introduction: 'Ignored',
      notebookIds: [NOTE_A, NOTE_B],
      previewHash: created.body.currentHash
    });
    assert.strictEqual(again.response.status, 200);
    assert.strictEqual(again.body.slug, slug);

    const publicRead = await fetchJson(`${url}/api/public/volumes/${slug}`);
    assert.strictEqual(publicRead.response.status, 200);
    assert.strictEqual(publicRead.body.title, 'Who pays?');
    assert.strictEqual(publicRead.body.introduction, 'Two finished notes, one question.');
    assert.strictEqual(publicRead.body.pieces[1].title, 'Whose downside?');
    assert.ok(!publicRead.body.catalog);
    assert.ok(!JSON.stringify(publicRead.body).includes(NOTE_A));
    assert.strictEqual(publicRead.response.headers.get('cache-control').includes('no-store'), true);

    shares[0].snapshot = {
      ...shares[0].snapshot,
      blocks: [...shares[0].snapshot.blocks, {
        id: 'p2',
        type: 'paragraph',
        text: 'Rewritten in the workshop.'
      }]
    };
    const stale = await owner();
    assert.strictEqual(stale.body.stale, true);
    assert.ok(!JSON.stringify(stale.body.snapshot).includes('Rewritten in the workshop.'));
    assert.ok(JSON.stringify(stale.body.preview).includes('Rewritten in the workshop.'));

    const staleUpdate = await owner('PUT', {
      title: 'Who pays?',
      introduction: 'Two finished notes, one question.',
      notebookIds: [NOTE_A, NOTE_B],
      previewHash: created.body.currentHash
    });
    assert.strictEqual(staleUpdate.response.status, 409);

    const next = await fetchJson(`${url}/api/volumes?notebookIds=${NOTE_B},${NOTE_A}&title=${encodeURIComponent('Who pays?')}&introduction=${encodeURIComponent('The later note now leads.')}`);
    const updated = await owner('PUT', {
      title: 'Who pays?',
      introduction: 'The later note now leads.',
      notebookIds: [NOTE_B, NOTE_A],
      previewHash: next.body.currentHash,
      correction: 'The exception now leads.'
    });
    assert.strictEqual(updated.response.status, 200, JSON.stringify(updated.body));
    assert.strictEqual(updated.body.slug, slug);
    assert.strictEqual(updated.body.stale, false);
    const afterUpdate = await fetchJson(`${url}/api/public/volumes/${slug}`);
    assert.strictEqual(afterUpdate.body.publishedAt, firstPublished);
    assert.ok(afterUpdate.body.revisedAt);
    assert.strictEqual(afterUpdate.body.correction, 'The exception now leads.');
    assert.strictEqual(afterUpdate.body.introduction, 'The later note now leads.');
    assert.strictEqual(afterUpdate.body.pieces[0].title, 'Whose downside?');
    assert.ok(JSON.stringify(afterUpdate.body).includes('Rewritten in the workshop.'));
    assert.strictEqual(hashPublicVolume(afterUpdate.body), updated.body.contentHash);

    shares.push(essay(NOTE_C, 'A third note', { paragraph: 'Another finished piece.' }));
    const still = await fetchJson(`${url}/api/public/volumes/${slug}`);
    assert.ok(!JSON.stringify(still.body).includes('A third note'));

    const revokedNote = shares.shift();
    const afterRevokeNote = await fetchJson(`${url}/api/public/volumes/${slug}`);
    assert.strictEqual(afterRevokeNote.body.pieces[1].title, 'Who gets to experiment, and who pays?');
    shares.unshift(revokedNote);

    const revoked = await owner('DELETE');
    assert.strictEqual(revoked.response.status, 200);
    assert.strictEqual(revoked.body.revoked, true);
    const gone = await fetchJson(`${url}/api/public/volumes/${slug}`);
    assert.strictEqual(gone.response.status, 404);
    const missing = await fetchJson(`${url}/api/public/volumes/no-such-slug`);
    assert.strictEqual(missing.response.status, 404);
    assert.deepStrictEqual(gone.body, missing.body);

    const reopenedReady = await fetchJson(`${url}/api/volumes?notebookIds=${NOTE_A},${NOTE_B}&title=${encodeURIComponent('Who pays?')}&introduction=${encodeURIComponent('A later collection.')}`);
    assert.strictEqual(reopenedReady.response.status, 200, JSON.stringify(reopenedReady.body));
    assert.strictEqual(reopenedReady.body.shared, false, JSON.stringify(reopenedReady.body));
    assert.strictEqual(reopenedReady.body.publishable, true, JSON.stringify(reopenedReady.body));
    const reopened = await owner('POST', {
      title: 'Who pays?',
      introduction: 'A later collection.',
      notebookIds: [NOTE_A, NOTE_B],
      previewHash: reopenedReady.body.currentHash
    });
    assert.strictEqual(reopened.response.status, 201, JSON.stringify(reopened.body));
    assert.ok(reopened.body.slug);
    assert.notStrictEqual(reopened.body.slug, slug);
  } finally {
    server.close();
  }
};

run().then(() => {
  console.log('notebookVolumeRoutes tests passed');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
