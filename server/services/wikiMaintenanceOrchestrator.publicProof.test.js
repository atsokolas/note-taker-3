const assert = require('assert');
const {
  findAffectedPages,
  isAcceptedPublicProofPage,
  isProtectedPublicPage,
  sourceEventMayTouchAcceptedPublicProof
} = require('./wikiMaintenanceOrchestrator');

const acceptedPage = {
  _id: 'accepted-page',
  title: 'NVIDIA accepted dossier',
  plainText: 'NVIDIA accepted dossier',
  status: 'published',
  visibility: 'shared',
  publicProof: {
    grade: 'proven',
    acceptedAt: '2026-07-20T00:00:00.000Z',
    acceptedEventId: 'accepted-event'
  }
};

assert.strictEqual(isAcceptedPublicProofPage(acceptedPage), true);
assert.strictEqual(isProtectedPublicPage(acceptedPage), true);
assert.strictEqual(isProtectedPublicPage({
  status: 'published',
  visibility: 'shared',
  publicProof: { grade: 'illustrative' }
}), true);
assert.strictEqual(isProtectedPublicPage({
  status: 'draft',
  visibility: 'private'
}), false);
assert.strictEqual(isAcceptedPublicProofPage({
  status: 'published',
  visibility: 'shared',
  publicProof: { grade: 'acceptance_in_progress' }
}), false);
assert.strictEqual(isAcceptedPublicProofPage({
  status: 'draft',
  visibility: 'private',
  publicProof: {
    grade: 'proven',
    acceptedAt: '2026-07-20T00:00:00.000Z',
    acceptedEventId: 'accepted-event'
  }
}), false);

assert.strictEqual(sourceEventMayTouchAcceptedPublicProof({
  sourceType: 'article',
  provider: 'library',
  metadata: { route: 'save-article' }
}), false);
assert.strictEqual(sourceEventMayTouchAcceptedPublicProof({
  sourceType: 'external',
  provider: 'sec-edgar',
  metadata: { allowAcceptedPublicProofMutation: true }
}), true);

class Query {
  constructor(rows) { this.rows = rows; }
  sort() { return this; }
  limit() { return this; }
  then(resolve) { return Promise.resolve(this.rows).then(resolve); }
}

const WikiPage = { find: () => new Query([acceptedPage]) };

const run = async () => {
  const ambientMatches = await findAffectedPages({
    WikiPage,
    userId: 'user-1',
    event: {
      title: 'NVIDIA accepted dossier',
      sourceType: 'article',
      provider: 'library',
      metadata: { route: 'save-article' }
    }
  });
  assert.deepStrictEqual(ambientMatches, []);

  const explicitMatches = await findAffectedPages({
    WikiPage,
    userId: 'user-1',
    event: {
      title: 'NVIDIA accepted dossier',
      sourceType: 'external',
      provider: 'sec-edgar',
      metadata: { allowAcceptedPublicProofMutation: true }
    }
  });
  assert.strictEqual(explicitMatches.length, 1);
  assert.strictEqual(explicitMatches[0]._id, 'accepted-page');

  console.log('wikiMaintenanceOrchestrator public proof tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
