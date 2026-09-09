const assert = require('assert');
const express = require('express');
const http = require('http');
const { buildWikiRouter } = require('../wikiRoutes');

/* A history list is ids, dates, reasons and summaries. This route shipped two
   full copies of the page per row, up to fifty rows, and a repo-page snapshot
   ran 1.5MB — so drawing five lines in an activity rail could move tens of
   megabytes. A few readers do reach into the snapshots, so this pins both what
   is dropped and what must keep arriving. */

const PAGE_ID = '64f100000000000000000abc';

const call = async (path) => {
  let projection = null;
  const query = {
    sort() { return this; },
    limit() { return this; },
    select(fields) { projection = fields; return this; },
    lean: async () => []
  };
  const app = express();
  app.use(express.json());
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
    WikiPage: {
      findOne: () => ({ select: () => ({ lean: async () => ({ _id: PAGE_ID }) }) })
    },
    WikiRevision: { find: () => query }
  }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: response.status, body: await response.json(), projection };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

(async () => {
  const listed = await call(`/api/wiki/pages/${PAGE_ID}/revisions`);
  assert.strictEqual(listed.status, 200);
  assert.ok(listed.projection, 'the default listing must project rather than send whole snapshots');
  const fields = listed.projection.split(/\s+/).filter(Boolean);

  // What any reader needs to identify and describe a revision.
  [
    'reason', 'actorType', 'promotionStatus', 'claimReview', 'summary',
    'createdAt', 'pageId', 'sourceEventId', 'maintenanceRunId'
  ].forEach(field => assert.ok(fields.includes(field), `the list must keep ${field}`));

  /* acceptedRevisionIdentity refuses a revision whose payload retention removed,
     and the unchanged marker has to travel with it or a revision that simply
     changed nothing reads as one whose content was lost. */
  ['snapshotPrunedAt', 'snapshotUnchanged', 'contentHash']
    .forEach(field => assert.ok(fields.includes(field), `the list must keep ${field}`));

  // Open Sentence walks back through these looking for an earlier wording.
  ['before.body', 'before.claims', 'before.citations', 'before.sourceRefs']
    .forEach(field => assert.ok(fields.includes(field), `Open Sentence reads ${field}`));

  // The accepted-revision picker falls back to a claim's text on either side.
  assert.ok(fields.includes('after.claims'), 'the accepted-revision picker reads after.claims');

  // And the weight nobody reads stays behind.
  ['before.plainText', 'after.body', 'before.aiState', 'before.freshness', 'after.plainText', 'before.publicProof']
    .forEach(field => assert.ok(!fields.includes(field), `${field} is never read here and must not be sent`));

  // A caller that genuinely wants whole snapshots can still ask for them.
  const full = await call(`/api/wiki/pages/${PAGE_ID}/revisions?include=snapshots`);
  assert.strictEqual(full.status, 200);
  assert.strictEqual(full.projection, null, 'include=snapshots must not project');

  // And an unrelated include is not a way to ask for them by accident.
  const other = await call(`/api/wiki/pages/${PAGE_ID}/revisions?include=something-else`);
  assert.ok(other.projection, 'only include=snapshots lifts the projection');

  console.log('wikiRoutes revision list projection tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
