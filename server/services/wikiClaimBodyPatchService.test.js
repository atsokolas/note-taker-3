const assert = require('assert');
const {
  buildClaimBodyPatch,
  inspectExactClaimAnchors,
  replaceExactClaimRange
} = require('./wikiClaimBodyPatchService');

const mark = (claimId, attrs = {}) => ({
  type: 'claim',
  attrs: { claimId, support: 'supported', citationIndexes: [1], contradictionIndexes: [], ...attrs }
});
const text = (value, marks = []) => ({ type: 'text', text: value, ...(marks.length ? { marks } : {}) });
const doc = (claimText, { claimId = 'claim-1', heading = 'Thesis', split = false, attrs = {} } = {}) => ({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [text(heading)] },
    {
      type: 'paragraph',
      content: split
        ? [text(claimText.slice(0, 4), [mark(claimId, attrs)]), text(claimText.slice(4), [mark(claimId, attrs), { type: 'link', attrs: { href: '/source' } }])]
        : [text(claimText, [mark(claimId, attrs)])]
    },
    { type: 'paragraph', content: [text('Untouched context.')] }
  ]
});
const sources = [{ _id: 'source-1' }, { _id: 'source-2' }];
const citations = [
  { _id: 'citation-1', sourceRefId: 'source-1' },
  { _id: 'citation-2', sourceRefId: 'source-2' }
];
const claim = (value, extra = {}) => ({
  claimId: 'claim-1', text: value, support: 'supported', citationIds: ['citation-1'],
  sourceRefIds: ['source-1'], contradictedByCitationIds: [], ...extra
});
const expectCode = (fn, code) => assert.throws(fn, error => error.code === code);

const before = doc('Old claim.');
const after = doc('New claim.');
const patch = buildClaimBodyPatch({
  beforeBody: before,
  afterBody: after,
  targetClaimId: 'claim-1',
  beforeClaim: claim('Old claim.'),
  proposedClaim: claim('New claim.'),
  afterSourceRefs: sources,
  afterCitations: citations
});
assert.strictEqual(patch.plainText, 'Thesis New claim. Untouched context.');
assert.strictEqual(patch.manifest.version, 1);
assert.strictEqual(patch.manifest.claimId, 'claim-1');
assert.notStrictEqual(patch.manifest.baseBodyHash, patch.manifest.afterBodyHash);

assert.deepStrictEqual(
  inspectExactClaimAnchors({ body: before, claims: [claim('Old claim.')] }),
  [{ claimId: 'claim-1', parentPath: ['content', 1], text: 'Old claim.' }]
);
const replaced = replaceExactClaimRange({
  body: before,
  claimId: 'claim-1',
  replacementText: 'New claim.',
  support: 'conflicted',
  citationIndexes: [1],
  contradictionIndexes: [2]
});
assert.strictEqual(replaced.content[1].content[0].text, 'New claim.');
assert.deepStrictEqual(replaced.content[1].content[0].marks[0].attrs, {
  claimId: 'claim-1', support: 'conflicted', citationIndexes: [1], contradictionIndexes: [2]
});
expectCode(() => inspectExactClaimAnchors({
  body: doc('Old claim.', { split: true }), claims: [claim('Old claim.')], requireSingleTextNode: true
}), 'claim_body_ambiguous');

const splitPatch = buildClaimBodyPatch({
  beforeBody: doc('Old claim.', { split: true }),
  afterBody: doc('New claim.', { split: true }),
  targetClaimId: 'claim-1',
  beforeClaim: claim('Old claim.'),
  proposedClaim: claim('New claim.'),
  afterSourceRefs: sources,
  afterCitations: citations
});
assert.strictEqual(splitPatch.plainText, 'Thesis New claim. Untouched context.');

const linkedBefore = doc('Old claim.', { split: true });
const linkedAfter = doc('New claim.', { split: true });
linkedAfter.content[1].content[1].marks[1].attrs.href = 'https://evil.invalid';
expectCode(() => buildClaimBodyPatch({
  beforeBody: linkedBefore, afterBody: linkedAfter, targetClaimId: 'claim-1',
  beforeClaim: claim('Old claim.'), proposedClaim: claim('New claim.'),
  afterSourceRefs: sources, afterCitations: citations
}), 'claim_body_unbounded');

const extraAttribute = doc('New claim.');
extraAttribute.content[1].content[0].marks[0].attrs.unreviewed = 'smuggled';
expectCode(() => buildClaimBodyPatch({
  beforeBody: before, afterBody: extraAttribute, targetClaimId: 'claim-1',
  beforeClaim: claim('Old claim.'), proposedClaim: claim('New claim.'),
  afterSourceRefs: sources, afterCitations: citations
}), 'claim_body_unbounded');

const duplicateMark = doc('New claim.');
duplicateMark.content[1].content[0].marks.push(mark('claim-1'));
expectCode(() => buildClaimBodyPatch({
  beforeBody: before, afterBody: duplicateMark, targetClaimId: 'claim-1',
  beforeClaim: claim('Old claim.'), proposedClaim: claim('New claim.'),
  afterSourceRefs: sources, afterCitations: citations
}), 'claim_body_ambiguous');

expectCode(() => buildClaimBodyPatch({
  beforeBody: before,
  afterBody: doc('New claim.', { heading: 'Rewritten thesis' }),
  targetClaimId: 'claim-1', beforeClaim: claim('Old claim.'), proposedClaim: claim('New claim.'),
  afterSourceRefs: sources, afterCitations: citations
}), 'claim_body_unbounded');

const duplicate = doc('New claim.');
duplicate.content.push({ type: 'paragraph', content: [text('New claim.', [mark('claim-1')])] });
expectCode(() => buildClaimBodyPatch({
  beforeBody: before, afterBody: duplicate, targetClaimId: 'claim-1',
  beforeClaim: claim('Old claim.'), proposedClaim: claim('New claim.'),
  afterSourceRefs: sources, afterCitations: citations
}), 'claim_body_ambiguous');

expectCode(() => buildClaimBodyPatch({
  beforeBody: doc('Old claim.', { claimId: 'legacy' }), afterBody: doc('New claim.', { claimId: 'legacy' }),
  targetClaimId: 'claim-1', beforeClaim: claim('Old claim.'), proposedClaim: claim('New claim.'),
  afterSourceRefs: sources, afterCitations: citations
}), 'claim_body_unmarked');

expectCode(() => buildClaimBodyPatch({
  beforeBody: before, afterBody: after, targetClaimId: 'claim-1',
  beforeClaim: claim('Different ledger text.'), proposedClaim: claim('New claim.'),
  afterSourceRefs: sources, afterCitations: citations
}), 'claim_body_mismatch');

expectCode(() => buildClaimBodyPatch({
  beforeBody: before,
  afterBody: doc('New claim.', { attrs: { citationIndexes: [2] } }),
  targetClaimId: 'claim-1', beforeClaim: claim('Old claim.'), proposedClaim: claim('New claim.'),
  afterSourceRefs: sources, afterCitations: citations
}), 'claim_body_mismatch');

expectCode(() => buildClaimBodyPatch({
  beforeBody: before,
  afterBody: doc('New claim.', { attrs: { citationIndexes: [3] } }),
  targetClaimId: 'claim-1', beforeClaim: claim('Old claim.'), proposedClaim: claim('New claim.'),
  afterSourceRefs: sources, afterCitations: citations
}), 'unresolved_evidence');

console.log('wikiClaimBodyPatchService tests passed');
