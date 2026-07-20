const assert = require('assert');
const mongoose = require('mongoose');
const { buildSecPublicProofAcceptance } = require('./wikiPublicProofAcceptanceService');

const pageId = new mongoose.Types.ObjectId();
const eventId = new mongoose.Types.ObjectId();
const revisionId = new mongoose.Types.ObjectId();
const now = new Date('2026-07-19T12:00:00.000Z');
const page = {
  _id: pageId,
  title: 'NVIDIA’s AI engine—and the obligations underneath it',
  externalWatches: { edgar: { ticker: 'NVDA', cik: '0001045810' } }
};
const event = {
  _id: eventId, provider: 'sec-edgar', status: 'processed',
  title: 'NVIDIA 8-K filed 2026-06-18',
  text: 'NVIDIA completed a senior notes offering consisting of seven tranches with an aggregate principal amount of $25 billion.',
  url: 'https://www.sec.gov/Archives/edgar/data/1045810/000119312526275783/d48176d8k.htm',
  affectedPageIds: [pageId]
};
const revision = {
  _id: revisionId, pageId, sourceEventId: eventId,
  promotionStatus: 'promoted', reason: 'source_event', after: page
};

(() => {
  const result = buildSecPublicProofAcceptance({
    page, events: [event], revisions: [revision], now,
    identity: { ticker: 'NVDA', cik: '0001045810', titlePattern: /NVIDIA/ },
    reason: 'Primary SEC evidence and its promoted claim-level maintenance revision passed editorial review.',
    requestedClocks: [{ sourceEventId: eventId, revisionId }]
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.record.grade, 'proven');
  assert.ok(result.record.acceptedEventId.startsWith('sec:NVDA:'));
  assert.deepStrictEqual(result.record.acceptedClocks.map(clock => clock.type), ['sec_edgar']);
  assert.strictEqual(result.record.acceptanceSnapshot.kind, 'sec_dossier_head_v1');
  assert.strictEqual(result.record.acceptanceSnapshot.revisionId, String(revisionId));
  assert.strictEqual(result.record.acceptanceSnapshot.headContentHash.length, 64);
})();

(() => {
  const result = buildSecPublicProofAcceptance({
    page: { ...page, plainText: 'Changed after the promoted revision.' },
    events: [event], revisions: [revision], now,
    identity: { ticker: 'NVDA', cik: '0001045810', titlePattern: /NVIDIA/ },
    reason: 'Primary SEC evidence and its promoted claim-level maintenance revision passed editorial review.',
    requestedClocks: [{ sourceEventId: eventId, revisionId }]
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes('The accepted head revision does not match the current dossier content.'));
})();

(() => {
  const result = buildSecPublicProofAcceptance({
    page: { ...page, externalWatches: { edgar: { ticker: 'AMD', cik: '0000002488' } } },
    events: [event], revisions: [revision], now,
    identity: { ticker: 'NVDA', cik: '0001045810', titlePattern: /NVIDIA/ },
    reason: 'Primary SEC evidence and its promoted claim-level maintenance revision passed editorial review.',
    requestedClocks: [{ sourceEventId: eventId, revisionId }]
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes('The target does not match the required SEC dossier identity.'));
})();

console.log('wikiPublicProofAcceptanceService tests passed');
