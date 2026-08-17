const assert = require('assert');
const express = require('express');
const { buildWikiRouter } = require('../wikiRoutes');

/* One claim, on one page, that you can hand to someone. The endpoint is behind
   the sign-in, and it refuses rather than printing a blank sheet for a page
   that has no claim on it. */

class Query {
  constructor(value) { this.value = value; }
  select() { return this; }
  sort() { return this; }
  limit() { return this; }
  lean() { return Promise.resolve(this.value ? JSON.parse(JSON.stringify(this.value)) : null); }
}

const judgmentPage = {
  _id: '6a5d1c842da7aa36147472ff',
  userId: 'owner-1',
  slug: 'a-written-process',
  title: 'A written process improves judgment.',
  judgment: {
    currentJudgment: 'A written process improves judgment.',
    why: [{ reasonId: 'r1', text: 'It held last quarter.', sourceLabel: 'Decision ledger' }],
    against: [{ reasonId: 'a1', text: 'The sample is small.' }],
    falsifiers: [],
    decisions: []
  }
};

const plainPage = { _id: '6a49ad6f22f7ad6bbbdf2154', userId: 'owner-1', slug: 'plain', title: 'Just a page.', judgment: null };

const serve = async (pages) => {
  const app = express();
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: 'owner-1' }; next(); },
    WikiPage: { findOne: (query) => new Query(pages[String(query._id)] || null) }
  }));
  const server = await new Promise((resolve) => {
    const next = app.listen(0, '127.0.0.1', () => resolve(next));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
};

const run = async () => {
  const { server, base } = await serve({ '6a5d1c842da7aa36147472ff': judgmentPage, '6a49ad6f22f7ad6bbbdf2154': plainPage });
  try {
    const ok = await fetch(`${base}/api/wiki/pages/6a5d1c842da7aa36147472ff/pamphlet.pdf`);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.headers.get('content-type'), 'application/pdf');
    assert.match(ok.headers.get('content-disposition') || '', /attachment; filename="a-written-process-judgment\.pdf"/);

    const body = Buffer.from(await ok.arrayBuffer());
    // A real PDF, not an error page with a PDF content type on it.
    assert.strictEqual(body.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(body.length > 800, `pamphlet was only ${body.length} bytes`);

    // A page with no claim gets a reason, not a blank sheet.
    const noClaim = await fetch(`${base}/api/wiki/pages/6a49ad6f22f7ad6bbbdf2154/pamphlet.pdf`);
    assert.strictEqual(noClaim.status, 409);
    assert.match((await noClaim.json()).error, /no claim on this page/i);

    // Someone else's page is not found, not printed.
    const missing = await fetch(`${base}/api/wiki/pages/6a49ad6f22f7ad6bbbdf2155/pamphlet.pdf`);
    assert.strictEqual(missing.status, 404);

    // An id that is not an id is refused before any lookup happens.
    const nonsense = await fetch(`${base}/api/wiki/pages/not-an-id/pamphlet.pdf`);
    assert.strictEqual(nonsense.status, 400);

    console.log('ok - judgment pamphlet route');
  } finally {
    server.close();
  }
};

run().catch((error) => { console.error(error); process.exit(1); });
