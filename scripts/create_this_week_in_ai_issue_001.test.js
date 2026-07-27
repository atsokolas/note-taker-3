const test = require('node:test');
const assert = require('node:assert/strict');

const { ISSUE_INPUT } = require('./create_this_week_in_ai_issue_001');
const { buildWeekendReadingsDraft } = require('../server/services/weekendReadingsService');
const { buildApprovalCandidate } = require('../server/services/weekendReadingsApprovalService');

test('Issue 001 is a bounded private research edition with consequential evidence fields', () => {
  const draft = buildWeekendReadingsDraft({ ...ISSUE_INPUT, ownerId: 'owner-1' });
  assert.equal(draft.title, 'This Week in AI — 2026-07-26 — Issue 001');
  assert.equal(draft.editionKey, 'this-week-in-ai:owner-1:2026-07-20:2026-07-26');
  assert.equal(draft.page.status, 'draft');
  assert.equal(draft.page.visibility, 'private');
  assert.equal(draft.items.length, 4);
  assert.equal(new Set(draft.items.map(item => item.canonicalUrl)).size, 4);
  assert.ok(draft.items.every(item => item.sourceQuality === 'primary'));
  assert.ok(draft.items.every(item => item.evidenceAssessment && item.consequence && item.boundary));
  assert.match(draft.plainText, /Strongest counterargument/);
  assert.match(draft.plainText, /Maintained-object updates/);
  assert.match(draft.plainText, /What to watch next/);
});

test('This Week in AI fails closed outside the two-to-five item editorial bound', () => {
  assert.throws(
    () => buildWeekendReadingsDraft({ ...ISSUE_INPUT, items: [ISSUE_INPUT.items[0]], ownerId: 'owner-1' }),
    /requires 2-5 selected items/
  );
  assert.throws(
    () => buildWeekendReadingsDraft({
      ...ISSUE_INPUT,
      ownerId: 'owner-1',
      items: [...ISSUE_INPUT.items, { ...ISSUE_INPUT.items[0], title: 'Fifth', url: 'https://arxiv.org/abs/2607.00001' }, { ...ISSUE_INPUT.items[1], title: 'Sixth', url: 'https://arxiv.org/abs/2607.00002' }]
    }),
    /requires 2-5 selected items/
  );
});

test('approval reconstruction preserves the exact This Week in AI profile without private routing metadata', () => {
  const draft = buildWeekendReadingsDraft({ ...ISSUE_INPUT, ownerId: 'owner-1' });
  const candidate = buildApprovalCandidate({ snapshot: draft.page, revisionId: 'revision-1' });
  assert.equal(candidate.artifactType, 'this_week_in_ai');
  assert.equal(candidate.publicationProfile, 'this_week_in_ai');
  assert.equal(candidate.sourceRefs.length, 4);
  assert.match(candidate.plainText, /Cross-layer consequence/);
  assert.doesNotMatch(JSON.stringify(candidate), /activeThesisPageId|affectedClaimIds|intakeProvenance/);
});
