const assert = require('assert');
const test = require('node:test');
const mongoose = require('mongoose');
const {
  buildCandidate,
  parseEvidencePackage
} = require('./create_alphabet_public_proof_acceptance_copy');

const evidenceFixture = () => {
  const rows = [
    '| A25K | [Alphabet 2025 Form 10-K](https://example.com/a25k) | FY2025 | Financial statements |',
    '| 2025 | [2025 Form 10-K](https://example.com/a25k) | FY2025 | Financial statements |',
    ...Array.from({ length: 19 }, (_, index) => (
      `| S${index + 1} | [Primary source ${index + 1}](https://example.com/source-${index + 1}) | 2026 | Relevant section ${index + 1} |`
    ))
  ].join('\n');
  const paragraphs = Array.from({ length: 20 }, (_, index) => (
    `**Fact.** Primary-source claim ${index + 1} is stated precisely.`
  )).join('\n\n');
  return `
## 1. Source inventory

| ID | Direct source | Date / period | Exact relevant sections |
|---|---|---|---|
${rows}

## 2. Financial series

## 7. Complete article draft

# Alphabet’s Berkshire-like allocator—and where the analogy breaks

## The analogy is useful only after it is cut down to size

${paragraphs}

---

## 8. Later source event for a maintenance-loop test
`;
};

test('builds a private acceptance candidate without inherited proof state', () => {
  const parsed = parseEvidencePackage(evidenceFixture());
  const sourcePage = {
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    title: 'Alphabet Maintenance Acceptance',
    slug: 'alphabet-maintenance-acceptance',
    pageType: 'source'
  };
  const candidate = buildCandidate({ sourcePage, parsed, now: new Date('2026-07-13T12:00:00.000Z') });

  assert.strictEqual(candidate.visibility, 'private');
  assert.strictEqual(candidate.status, 'draft');
  assert.strictEqual(candidate.publicProof, null);
  assert.strictEqual(candidate.freshness.acceptedThrough, null);
  assert.strictEqual(candidate.sourceRefs.length, 20);
  assert.strictEqual(candidate.claims.length, 20);
  assert.ok(candidate.claims.every(claim => claim.sourceRefIds.length > 0));
  assert.ok(candidate.sourceRefs.every(ref => /^https:\/\//.test(ref.url)));
  assert.ok(candidate.plainText.includes('Primary-source claim 20 is stated precisely.'));
  assert.ok(!candidate.plainText.includes('[[wiki link]]'));
});

test('deduplicates the repeated 2025 filing while preserving its aliases', () => {
  const parsed = parseEvidencePackage(evidenceFixture());
  const alphabet2025 = parsed.sourceRows.find(row => row.id === 'A25K');

  assert.ok(alphabet2025);
  assert.deepStrictEqual(alphabet2025.aliases, ['A25K', 'FY2025']);
  assert.strictEqual(parsed.sourceRows.filter(row => row.url === alphabet2025.url).length, 1);
});
