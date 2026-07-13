const assert = require('assert');
const { evaluateAlphabetProof, publicDenylistLeaks } = require('./alphabetProofAcceptanceService');

const pageId = '507f1f77bcf86cd799439011';
const filingId = '507f1f77bcf86cd799439012';

const completeFixture = () => ({
  page: {
    _id: pageId,
    title: 'Alphabet allocator dossier',
    externalWatches: { edgar: { status: 'active' }, transcripts: { status: 'active' } },
    freshness: { acceptedThrough: { sourceEventId: filingId } }
  },
  events: [
    { _id: filingId, provider: 'sec-edgar', status: 'processed', affectedPageIds: [pageId], url: 'https://www.sec.gov/Archives/example', title: 'Alphabet 10-Q', text: 'A'.repeat(100) },
    { _id: '507f1f77bcf86cd799439013', provider: 'earnings-transcript', status: 'processed', affectedPageIds: [pageId], title: 'Alphabet Q1 transcript', text: 'B'.repeat(100) }
  ],
  revisions: [{
    _id: '507f1f77bcf86cd799439014', sourceEventId: filingId, reason: 'source_event', promotionStatus: 'promoted',
    metadata: { comparison: { claimDeltas: { added: [], changed: [], gainedSupport: [], contradicted: [], preserved: [], removed: [] } } }
  }],
  briefing: { recentReceipts: [{ id: 'receipt-1', kind: 'wiki_maintenance', touched: [{ id: pageId }] }] },
  registryItem: {
    proofGrade: { grade: 'proven', criteria: { explicitlyAccepted: true } },
    maintenanceProof: { currentThrough: { ref: 'https://www.sec.gov/Archives/example' } }
  },
  publicPage: { id: pageId, maintenanceProof: { currentThrough: { ref: 'https://www.sec.gov/Archives/example' } } }
});

{
  const result = evaluateAlphabetProof(completeFixture());
  assert.strictEqual(result.verdict, 'accepted');
  assert.deepStrictEqual(result.failed, []);
}

{
  const fixture = completeFixture();
  fixture.registryItem.proofGrade.grade = 'acceptance_in_progress';
  fixture.events = fixture.events.filter(event => event.provider !== 'earnings-transcript');
  const result = evaluateAlphabetProof(fixture);
  assert.strictEqual(result.verdict, 'not_accepted');
  assert(result.failed.includes('processedSubstantiveTranscript'));
  assert(result.failed.includes('publicProofExplicitlyProven'));
}

assert.deepStrictEqual(publicDenylistLeaks({ page: { userId: 'private' } }), ['userid']);
console.log('alphabetProofAcceptanceService tests passed');
