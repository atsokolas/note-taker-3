const assert = require('assert');
const express = require('express');
const http = require('http');
const { buildWikiRouter } = require('../wikiRoutes');

/* /wiki opens on what moved since you last looked: one sentence per page, the
   net change since then, attributed to the reading that caused it. A page whose
   timestamp moved without a promoted revision did not change for the reader. */

const chain = (rows) => {
  const query = { select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => rows };
  return query;
};
const heading = text => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });
const para = text => ({ type: 'paragraph', content: [{ type: 'text', text }] });

const pages = [
  { _id: 'p1', title: 'Costco', updatedAt: new Date(), body: { type: 'doc', content: [para('Members.'), heading('Renewal rates'), para('Above 90%.')] }, sourceRefs: [{ title: 'Ben Carlson', objectId: 'a2' }] },
  { _id: 'p2', title: 'Touched only', updatedAt: new Date(), body: { type: 'doc', content: [para('Same.')] }, sourceRefs: [] }
];
const revisions = {
  p1: [{ _id: 'r1', reason: 'source_event', actorType: 'agent', sourceEventId: 'e1', createdAt: new Date(), before: { body: { type: 'doc', content: [para('Members.')] }, sourceRefs: [] } }],
  p2: [{ _id: 'r2', reason: 'agent_maintenance', snapshotUnchanged: true, createdAt: new Date() }]
};

(async () => {
  const app = express();
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
    WikiPage: { countDocuments: async () => 12, find: () => chain(pages) },
    WikiRevision: { find: ({ pageId }) => chain(revisions[pageId]) },
    WikiSourceEvent: { find: () => chain([{ _id: 'e1', title: 'Ben Carlson', createdAt: new Date('2026-10-10') }]) },
    WikiMaintenanceRun: { find: () => chain([]) }
  }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/wiki/changes?since=2026-10-01T00:00:00.000Z`);
    const body = await response.json();
    assert.strictEqual(response.status, 200);
    assert.strictEqual(body.pageCount, 12);
    assert.strictEqual(body.changes.length, 1, 'a page with only an unchanged pass did not move');
    const [change] = body.changes;
    assert.strictEqual(change.pageId, 'p1');
    assert.strictEqual(change.by, 'partner');
    assert.strictEqual(change.sentence, 'Added a section on Renewal rates, citing Ben Carlson.');
    assert.strictEqual(change.changeSource.title, 'Ben Carlson');
    console.log('wikiRoutes changes tests passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
