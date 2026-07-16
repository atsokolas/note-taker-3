const assert = require('assert');
const {
  acceptanceBody,
  readinessReport,
  selectClockCandidates
} = require('./run_alphabet_filing_acceptance');

const pageId = '507f1f77bcf86cd799439011';
const filingId = '507f1f77bcf86cd799439012';
const transcriptId = '507f1f77bcf86cd799439013';
const fixture = {
  page: {
    _id: pageId,
    title: 'Alphabet allocator dossier',
    visibility: 'private',
    publicProof: { grade: 'acceptance_in_progress' },
    externalWatches: { transcripts: { status: 'active', errorMessage: '' } }
  },
  events: [
    { _id: filingId, provider: 'sec-edgar', status: 'processed', affectedPageIds: [pageId], url: 'https://sec.gov/example', title: 'Alphabet 10-Q', text: 'A'.repeat(100), processedAt: '2026-07-01' },
    { _id: transcriptId, provider: 'fmp', status: 'processed', affectedPageIds: [pageId], title: 'Alphabet Q1 transcript', text: 'B'.repeat(100), processedAt: '2026-07-02' }
  ],
  revisions: [
    { _id: '507f1f77bcf86cd799439014', pageId, sourceEventId: filingId, reason: 'source_event', promotionStatus: 'promoted', createdAt: '2026-07-01' },
    { _id: '507f1f77bcf86cd799439015', pageId, sourceEventId: transcriptId, reason: 'agent_maintenance', promotionStatus: 'promoted', createdAt: '2026-07-02' }
  ]
};

const clocks = selectClockCandidates(fixture);
assert.strictEqual(String(clocks.filing.event._id), filingId);
assert.strictEqual(String(clocks.transcript.event._id), transcriptId);
assert.strictEqual(readinessReport({ ...fixture, clocks }).readyForAcceptancePreview, true);
assert.deepStrictEqual(acceptanceBody(clocks).acceptedClocks, [
  { sourceEventId: filingId, revisionId: '507f1f77bcf86cd799439014' }
]);

const blocked = {
  ...fixture,
  page: {
    ...fixture.page,
    externalWatches: { transcripts: { status: 'idle', errorMessage: '' } }
  },
  clocks: selectClockCandidates({ ...fixture, events: [] })
};
const blockedReport = readinessReport(blocked);
assert.strictEqual(blockedReport.readyForAcceptancePreview, false);
assert(blockedReport.gaps.includes('No substantive SEC event has a promoted maintenance revision.'));

console.log('run_alphabet_filing_acceptance tests passed');
