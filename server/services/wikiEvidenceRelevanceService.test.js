const assert = require('assert');
const mongoose = require('mongoose');
const { applyDirectEvidenceMatches, assessEventAgainstClaims } = require('./wikiEvidenceRelevanceService');
const { compareClaimLedgers } = require('./wikiClaimComparisonService');

(() => {
  const direct = assessEventAgainstClaims({
    event: {
      text: 'Google Services operating income increased to $30 billion as advertising revenue and operating cash flow remained strong during the quarter.'
    },
    claims: [{
      claimId: 'claim-1',
      section: 'Evidence',
      text: 'Google Services operating income increased to $30 billion while advertising revenue and operating cash flow remained strong.'
    }]
  });
  assert.strictEqual(direct.decision, 'direct_claim_matches');
  assert.strictEqual(direct.directMatchCount, 1);
  assert.strictEqual(direct.matches[0].claimId, 'claim-1');

  const numericMismatch = assessEventAgainstClaims({
    event: {
      text: 'Google Services operating income increased to $18 billion as advertising revenue remained strong.'
    },
    claims: [{
      claimId: 'claim-2',
      text: 'Google Services operating income increased to $30 billion as advertising revenue remained strong.'
    }]
  });
  assert.strictEqual(numericMismatch.decision, 'no_direct_claim_match');

  const unrelated = assessEventAgainstClaims({
    event: { text: 'The board appointed a new chief accounting officer effective June 2.' },
    claims: [{
      claimId: 'claim-3',
      text: 'Advertising cash flow funds long-duration artificial intelligence research and strategic acquisitions.'
    }]
  });
  assert.strictEqual(unrelated.decision, 'no_direct_claim_match');
})();

(() => {
  const eventId = new mongoose.Types.ObjectId();
  const sourceRefId = new mongoose.Types.ObjectId();
  const page = {
    sourceRefs: [{
      _id: sourceRefId,
      objectId: eventId,
      type: 'external',
      title: 'GOOGL 10-Q',
      url: 'https://www.sec.gov/filing'
    }],
    citations: [],
    claims: [{
      claimId: 'claim-direct',
      text: 'Google Services operating income increased to $30 billion while advertising revenue remained strong.',
      section: 'Evidence',
      support: 'supported',
      sourceRefIds: [],
      citationIds: [],
      history: []
    }],
    markModified(field) { this.modified = [...(this.modified || []), field]; }
  };
  const assessment = assessEventAgainstClaims({
    event: {
      _id: eventId,
      text: 'Google Services operating income increased to $30 billion while advertising revenue remained strong during the quarter.'
    },
    claims: page.claims
  });
  const beforeClaims = JSON.parse(JSON.stringify(page.claims));
  const result = applyDirectEvidenceMatches({
    page,
    event: { _id: eventId, title: 'GOOGL 10-Q', url: 'https://www.sec.gov/filing' },
    assessment,
    now: new Date('2026-07-12T20:00:00.000Z')
  });
  assert.strictEqual(result.applied, 1);
  assert.strictEqual(page.citations.length, 1);
  assert.strictEqual(String(page.claims[0].sourceRefIds[0]), String(sourceRefId));
  assert.strictEqual(String(page.claims[0].citationIds[0]), String(page.citations[0]._id));
  assert.strictEqual(page.claims[0].history[0].event, 'source_evidence_added');
  const comparison = compareClaimLedgers({ beforeClaims, afterClaims: page.claims });
  assert.strictEqual(comparison.counts.changed, 1);
  assert.strictEqual(comparison.counts.gainedSupport, 1);
  assert.strictEqual(comparison.counts.removed, 0);

  const idempotent = applyDirectEvidenceMatches({ page, event: { _id: eventId }, assessment });
  assert.strictEqual(idempotent.applied, 0);
  assert.strictEqual(page.citations.length, 1);
})();

console.log('wikiEvidenceRelevanceService tests passed');
