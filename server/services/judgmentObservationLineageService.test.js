const assert = require('assert');
const {
  proposeObservationLineage,
  readObservationLineage,
  reviewObservationLineage
} = require('./judgmentObservationLineageService');

class Query {
  constructor(value) { this.value = value; }
  async lean() { return this.value; }
}

const families = [{
  familyId: 'sessions-eight',
  label: 'the same eight sessions',
  status: 'accepted',
  acceptedAt: '2026-09-10T12:00:00.000Z',
  members: [
    { sourceEventId: 'event-origin', role: 'origin', sourceVersion: 'v1' },
    { sourceEventId: 'event-account', role: 'derivative' },
    { sourceEventId: 'event-missing', role: 'account' }
  ]
}, {
  familyId: 'suggested-other-root',
  label: 'possibly the same interview',
  status: 'proposed',
  proposedBy: 'agent',
  members: [
    { sourceEventId: 'event-origin', role: 'unknown' },
    { sourceEventId: 'event-proposed', role: 'unknown' }
  ]
}];

const events = [{
  _id: 'event-origin',
  title: 'Session notes',
  text: 'Eight readers attempted the return path.',
  sourceType: 'external',
  metadata: { observedAt: '2026-09-01T09:00:00.000Z' },
  createdAt: '2026-09-02T09:00:00.000Z'
}, {
  _id: 'event-account',
  title: 'Research summary',
  summary: 'An edited account of the same sessions.',
  sourceType: 'article',
  metadata: { publishedAt: '2026-09-03T09:00:00.000Z' },
  createdAt: '2026-09-04T09:00:00.000Z'
}, {
  _id: 'event-proposed',
  title: 'Unconfirmed interview note',
  sourceType: 'external'
}];

(async () => {
  let lineageQuery;
  let eventQuery;
  const result = await readObservationLineage({
    JudgmentObservationLineage: {
      find(query) { lineageQuery = query; return new Query(families); }
    },
    WikiSourceEvent: {
      find(query) { eventQuery = query; return new Query(events); }
    },
    userId: 'owner-1',
    sourceEventId: 'event-origin'
  });

  assert.strictEqual(lineageQuery.userId, 'owner-1');
  assert.strictEqual(lineageQuery['members.sourceEventId'], 'event-origin');
  assert.strictEqual(eventQuery.userId, 'owner-1');
  assert.strictEqual(result.state, 'accepted');
  assert.strictEqual(result.families[0].documentCount, 3);
  assert.strictEqual(result.families[0].accounts.length, 2);
  assert.strictEqual(result.families[0].unavailableCount, 1);
  assert.strictEqual(result.families[0].partial, true);
  assert.strictEqual(result.families[0].accounts[0].observedAt, '2026-09-01T09:00:00.000Z');
  assert.strictEqual(result.families[0].accounts[1].publishedAt, '2026-09-03T09:00:00.000Z');
  assert.strictEqual(result.proposals[0].status, 'proposed');

  const unknown = await readObservationLineage({
    JudgmentObservationLineage: { find: () => new Query([]) },
    WikiSourceEvent: { find: () => new Query([]) },
    userId: 'owner-1',
    sourceEventId: 'event-without-family'
  });
  assert.deepStrictEqual(unknown, { state: 'unknown', families: [], proposals: [] });

  let proposalUpdate;
  const proposal = await proposeObservationLineage({
    JudgmentObservationLineage: {
      findOne: () => new Query(null),
      findOneAndUpdate(_query, update) {
        proposalUpdate = update;
        return new Query({ familyId: 'sessions-eight', status: 'proposed', __v: 0 });
      }
    },
    WikiSourceEvent: {
      find: query => new Query(query._id.$in.map(_id => ({ _id })))
    },
    userId: 'owner-1',
    familyId: 'sessions-eight',
    label: 'the same eight sessions',
    proposedBy: 'agent',
    members: [
      { sourceEventId: 'event-origin', role: 'origin' },
      { sourceEventId: 'event-account', role: 'derivative' }
    ]
  });
  assert.deepStrictEqual(proposal, { familyId: 'sessions-eight', status: 'proposed', version: 0 });
  assert.strictEqual(proposalUpdate.$set.proposedBy, 'agent');
  assert.strictEqual(proposalUpdate.$set.members.length, 2);

  let reviewQuery;
  const reviewed = await reviewObservationLineage({
    JudgmentObservationLineage: {
      findOne: () => new Query({ familyId: 'sessions-eight', status: 'proposed', __v: 0 }),
      findOneAndUpdate(query) {
        reviewQuery = query;
        return new Query({ familyId: 'sessions-eight', status: 'accepted', __v: 1 });
      }
    },
    userId: 'owner-1',
    familyId: 'sessions-eight',
    expectedVersion: 0,
    action: 'accept'
  });
  assert.strictEqual(reviewQuery.status, 'proposed');
  assert.deepStrictEqual(reviewed, { familyId: 'sessions-eight', status: 'accepted', version: 1 });

  console.log('judgmentObservationLineageService tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
