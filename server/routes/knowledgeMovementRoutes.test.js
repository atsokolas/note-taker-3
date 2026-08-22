const assert = require('assert');
const express = require('express');
const { buildKnowledgeMovementRouter } = require('./knowledgeMovementRoutes');
const {
  createKnowledgeMovementChainFixture
} = require('../fixtures/knowledgeMovementChainFixture');

const fixture = createKnowledgeMovementChainFixture();
const userId = fixture.ids.user;

class Query {
  constructor(value) { this.value = value; }
  sort() { return this; }
  limit() { return this; }
  select() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.value).then(resolve, reject); }
}

const modelFor = value => ({ find: () => new Query(value) });
const app = express();
app.use(express.json());
app.use(buildKnowledgeMovementRouter({
  authenticateToken: (req, res, next) => {
    if (req.headers.authorization !== 'Bearer qa') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: userId };
    return next();
  },
  WikiPage: modelFor([fixture.page]),
  WikiRevision: modelFor([fixture.candidateRevision]),
  WikiSourceEvent: modelFor([fixture.sourceEvent]),
  TagMeta: modelFor([fixture.concept]),
  NoeisReceipt: modelFor([]),
  Article: {
    find: () => new Query([fixture.importedSource]),
    findOne: () => new Query(fixture.importedSource)
  }
}));

const server = app.listen(0, '127.0.0.1', async () => {
  const { port } = server.address();
  const request = async path => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { Authorization: 'Bearer qa' }
    });
    return { response, body: await response.json() };
  };

  try {
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/knowledge/movements`);
    assert.strictEqual(unauthorized.status, 401);
    const unauthorizedReadiness = await fetch(`http://127.0.0.1:${port}/api/knowledge/field/readiness`);
    assert.strictEqual(unauthorizedReadiness.status, 401);

    const replay = await request('/api/knowledge/movements?limit=3&since=2026-07-27T00%3A00%3A00.000Z');
    assert.strictEqual(replay.response.status, 200);
    assert.strictEqual(replay.body.movements.length, 1);
    assert.strictEqual(replay.body.movements[0].kind, 'contradiction');
    assert.strictEqual(replay.body.movements[0].subject.id, fixture.claimId);
    assert.strictEqual(replay.body.movements[0].evidence[0].id, fixture.importedSource._id);
    assert.deepStrictEqual(
      Object.keys(replay.body.movements[0]).sort(),
      [
        'affected', 'episodeId', 'evidence', 'id', 'kind', 'materiality', 'nextAction',
        'occurredAt', 'provenance', 'reviewState', 'subject', 'subjects',
        'title', 'unresolved', 'whyItMatters'
      ]
    );
    assert.strictEqual(replay.body.movements[0].subjects.length, 1);
    assert.deepStrictEqual(
      Object.keys(replay.body.movements[0].subject).sort(),
      ['href', 'id', 'parentId', 'title', 'type']
    );
    assert.deepStrictEqual(
      Object.keys(replay.body.movements[0].evidence[0]).sort(),
      ['href', 'id', 'sourceUrl', 'title', 'type']
    );
    assert.ok(replay.body.movements[0].affected.some(ref => (
      ref.type === 'wiki_page'
      && ref.id === fixture.page._id
      && ref.href === `/wiki/workspace?page=${fixture.page._id}`
    )));
    assert.ok(replay.body.movements[0].affected.some(ref => (
      ref.type === 'concept'
      && ref.id === fixture.concept._id
      && ref.href.includes('/think?tab=concepts')
    )));
    assert.deepStrictEqual(
      Object.keys(replay.body.movements[0].unresolved[0]).sort(),
      ['href', 'id', 'parentId', 'title', 'type']
    );
    assert.deepStrictEqual(
      Object.keys(replay.body.movements[0].nextAction).sort(),
      ['href', 'intent', 'label']
    );
    assert.strictEqual(replay.body.movements[0].nextAction.intent, 'investigate_movement');
    assert.strictEqual(replay.body.movements[0].nextAction.label, 'Investigate in Think');
    assert.match(
      replay.body.movements[0].nextAction.href,
      new RegExp(`wikiPageId=${fixture.page._id}.*revisionId=${fixture.candidateRevision._id}.*claimId=${fixture.claimId}`)
    );
    assert.deepStrictEqual(
      Object.keys(replay.body.movements[0].provenance).sort(),
      ['deterministicFacts', 'eventIds', 'revisionIds']
    );
    assert.ok(replay.body.generatedAt);

    const quiet = await request('/api/knowledge/movements?limit=3&since=2026-08-01T00%3A00%3A00.000Z');
    assert.strictEqual(quiet.response.status, 200);
    assert.deepStrictEqual(quiet.body.movements, []);

    const invalidSince = await request('/api/knowledge/movements?since=yesterday');
    assert.strictEqual(invalidSince.response.status, 400);
    assert.match(invalidSince.body.error, /ISO-8601/i);

    const invalidLimit = await request('/api/knowledge/movements?limit=zero');
    assert.strictEqual(invalidLimit.response.status, 400);

    const clampedLimit = await request('/api/knowledge/movements?limit=500');
    assert.strictEqual(clampedLimit.response.status, 200);

    const readiness = await request('/api/knowledge/field/readiness');
    assert.strictEqual(readiness.response.status, 200);
    assert.strictEqual(readiness.body.version, 1);
    assert.strictEqual(readiness.body.eligible, false);
    assert.strictEqual(readiness.body.state, 'insufficient_verified_density');
    assert.ok(readiness.body.metrics.verifiedMovements >= 1);
    assert.ok(readiness.body.gaps.some(gap => gap.code === 'edge_density'));
    assert.deepStrictEqual(Object.keys(readiness.body).sort(), [
      'asOf', 'eligible', 'evidence', 'gaps', 'metrics', 'state', 'thresholds', 'version'
    ]);

    const weekly = await request('/api/knowledge/movements/weekly');
    assert.strictEqual(weekly.response.status, 200);
    assert.ok(weekly.body.weekStart && weekly.body.weekEnd);
    assert.ok(Array.isArray(weekly.body.groups));
    const weeklyKinds = weekly.body.groups.flatMap(group => group.items.map(item => item.kind));
    ['decision_due', 'outcome_due', 'question_answerable'].forEach(kind => {
      assert.ok(!weeklyKinds.includes(kind), `${kind} is standing state, not a week event`);
    });
    if (!weekly.body.quiet) {
      const group = weekly.body.groups[0];
      assert.ok(group.subject.type === 'wiki_page');
      assert.ok(group.subject.href.startsWith('/wiki/workspace'));
      assert.ok(group.items.every(item => item.href));
      assert.strictEqual(weekly.body.total >= weekly.body.groups.length, true);
    }

    console.log('knowledgeMovementRoutes tests passed');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
