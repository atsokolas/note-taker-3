const assert = require('assert');
const test = require('node:test');
const mongoose = require('mongoose');
const {
  buildCandidate,
  parseEvidencePackage,
  rewriteUnsupportedClaimText
} = require('./create_alphabet_public_proof_acceptance_copy');

const evidenceFixture = () => {
  const requiredIds = [
    'A1Q26', 'AP26', 'ACOI', 'B25AR', 'B25K', 'B25L',
    'DOJ-S', 'DOJ-AT', 'EC-AT', 'CMA-S', 'CMA-AT',
    '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024'
  ];
  const rows = [
    '| A25K | [Alphabet 2025 Form 10-K](https://example.com/a25k) | FY2025 | Financial statements |',
    '| 2025 | [2025 Form 10-K](https://example.com/a25k) | FY2025 | Financial statements |',
    ...requiredIds.map((id, index) => (
      `| ${id} | [Primary source ${id}](https://example.com/source-${index + 1}) | 2026 | Relevant section ${id} |`
    ))
  ].join('\n');
  const paragraphs = Array.from({ length: 20 }, (_, index) => (
    `**Fact.** Alphabet became the parent holding company of Google in 2015. Fixture claim ${index + 1}.`
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
  assert.strictEqual(candidate.sourceRefs.length, 21);
  assert.strictEqual(candidate.claims.length, 20);
  assert.ok(candidate.claims.every(claim => claim.sourceRefIds.length > 0));
  assert.ok(candidate.sourceRefs.every(ref => /^https:\/\//.test(ref.url)));
  assert.ok(candidate.plainText.includes('Fixture claim 20.'));
  assert.ok(!candidate.plainText.includes('[[wiki link]]'));
});

test('deduplicates the repeated 2025 filing while preserving its aliases', () => {
  const parsed = parseEvidencePackage(evidenceFixture());
  const alphabet2025 = parsed.sourceRows.find(row => row.id === 'A25K');

  assert.ok(alphabet2025);
  assert.deepStrictEqual(alphabet2025.aliases, ['A25K', 'FY2025']);
  assert.strictEqual(parsed.sourceRows.filter(row => row.url === alphabet2025.url).length, 1);
});

test('removes assertions that do not have a primary source in the package', () => {
  const rewritten = rewriteUnsupportedClaimText(
    'Inference. Other Bets is an option portfolio. Waymo’s $16 billion 2026 funding round, funded in significant majority by Alphabet, indicates continued commitment and some external validation. It does not prove returns. The General Court annulled the Commission’s AdSense for Search decision and €1.5 billion fine, though the Commission appealed.'
  );

  assert.ok(!rewritten.includes('$16 billion'));
  assert.ok(!rewritten.includes('AdSense for Search'));
  assert.ok(rewritten.includes('It does not prove returns.'));
});

test('fails closed instead of falling back to section-wide citations', () => {
  const unmapped = evidenceFixture().replace(
    '**Fact.** Alphabet became the parent holding company of Google in 2015. Fixture claim 1.',
    '**Fact.** This claim has no explicit evidence rule.'
  );

  assert.throws(
    () => parseEvidencePackage(unmapped),
    /No claim-level evidence mapping/
  );
});

test('grades factual claims as supported and editorial claims as partial', () => {
  const parsed = parseEvidencePackage(evidenceFixture());
  parsed.blocks = [{
    type: 'paragraph',
    text: 'Fact. Alphabet became the parent holding company of Google in 2015.',
    section: 'Thesis',
    label: 'Fact',
    sourceIds: ['A25K']
  }, {
    type: 'paragraph',
    text: 'Inference. That structure creates an allocator’s problem.',
    section: 'Thesis',
    label: 'Inference',
    sourceIds: ['A25K', 'A1Q26']
  }, {
    type: 'paragraph',
    text: 'Limit. The resemblance is not identity.',
    section: 'Thesis',
    label: 'Limit',
    sourceIds: ['A25K', 'B25AR']
  }];
  const candidate = buildCandidate({
    sourcePage: {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      title: 'Alphabet Maintenance Acceptance',
      slug: 'alphabet-maintenance-acceptance',
      pageType: 'source'
    },
    parsed,
    now: new Date('2026-07-13T12:00:00.000Z')
  });

  assert.deepStrictEqual(candidate.claims.map(claim => claim.support), [
    'supported',
    'partial',
    'partial'
  ]);
  assert.deepStrictEqual(candidate.claims.map(claim => claim.sourceRefIds.length), [1, 2, 2]);
});
