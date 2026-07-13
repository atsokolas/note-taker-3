const assert = require('assert');
const { buildAlphabetPublicProofAcceptance } = require('./wikiPublicProofAcceptanceService');

const pageId = '507f1f77bcf86cd799439011';
const filingId = '507f1f77bcf86cd799439012';
const transcriptId = '507f1f77bcf86cd799439013';
const filingRevisionId = '507f1f77bcf86cd799439014';
const transcriptRevisionId = '507f1f77bcf86cd799439015';
const now = new Date('2026-07-13T00:00:00.000Z');

const fixture = () => ({
  page: { _id: pageId, title: 'Alphabet allocator dossier' },
  requestedClocks: [
    { sourceEventId: filingId, revisionId: filingRevisionId },
    { sourceEventId: transcriptId, revisionId: transcriptRevisionId }
  ],
  events: [
    { _id: filingId, provider: 'sec-edgar', status: 'processed', affectedPageIds: [pageId], url: 'https://www.sec.gov/Archives/filing', text: 'Substantive filing evidence. '.repeat(5) },
    { _id: transcriptId, provider: 'fmp-transcripts', status: 'processed', affectedPageIds: [pageId], text: 'Substantive transcript evidence. '.repeat(5) }
  ],
  revisions: [
    { _id: filingRevisionId, pageId, sourceEventId: filingId, promotionStatus: 'promoted', reason: 'source_event' },
    { _id: transcriptRevisionId, pageId, sourceEventId: transcriptId, promotionStatus: 'promoted', reason: 'source_event' }
  ],
  reason: 'Both authoritative clocks and their claim deltas passed editorial review.',
  now
});

{
  const result = buildAlphabetPublicProofAcceptance(fixture());
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.record.acceptedClocks.map(clock => clock.type), ['sec_edgar', 'earnings_transcript']);
  assert.strictEqual(result.record.acceptedAt, now);
}

{
  const input = fixture();
  input.requestedClocks.pop();
  const result = buildAlphabetPublicProofAcceptance(input);
  assert.strictEqual(result.ok, false);
  assert(result.errors.includes('Missing required accepted clock: earnings_transcript.'));
}

{
  const input = fixture();
  input.revisions[1].promotionStatus = 'candidate';
  const result = buildAlphabetPublicProofAcceptance(input);
  assert.strictEqual(result.ok, false);
  assert(result.errors.some(error => /promoted maintenance revision/.test(error)));
}

console.log('wikiPublicProofAcceptanceService tests passed');
