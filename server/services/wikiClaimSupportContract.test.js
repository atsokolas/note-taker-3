const assert = require('assert');
const mongoose = require('mongoose');
const { WikiPage } = require('../models');
const { deriveClaimsFromDoc, __testables } = require('./wikiMaintenanceService');
const { serializeWikiPage, serializePublicWikiPage } = require('../routes/wikiRoutes');
const { buildWikiPageGraphRows } = require('./wikiGraphConnectionService');
const { compareClaimLedgers } = require('./wikiClaimComparisonService');
const { buildClaimBodyPatch } = require('./wikiClaimBodyPatchService');

const sourceId = new mongoose.Types.ObjectId().toString();
const citationId = new mongoose.Types.ObjectId().toString();
const refs = [{ _id: sourceId, type: 'article', objectId: new mongoose.Types.ObjectId().toString(), title: 'Retained source', url: 'https://example.test/source', snippet: 'A retained source passage.' }];
const citations = [{ _id: citationId, sourceRefId: sourceId }];
const words = 'An owned sentence whose relationship has not been assessed.';
const body = (support, text = words, indexes = [1], claimId = 'owned-claim') => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'claim', attrs: { claimId, ...(support === undefined ? {} : { support }), citationIndexes: indexes, contradictionIndexes: [] } }] }] }] });
const grade = doc => doc.content[0].content[0].marks[0].attrs.support;
const derive = (doc, previousClaims = []) => deriveClaimsFromDoc({ body: doc, sourceRefs: refs, citations, previousClaims });

for (const support of [undefined, 'invalid', 'unknown']) {
  const doc = body(support);
  const claims = derive(doc);
  assert.strictEqual(claims[0].support, 'unknown', `support ${support} must not be inferred from citations`);
  assert.strictEqual(claims[0].confidence, 0, 'unknown evidence must not acquire a confidence score');
  assert.strictEqual(claims[0].lastVerifiedAt, null, 'attached sources are not a verification');
  assert.strictEqual(claims[0].history[0].support, 'unknown');
  assert.deepStrictEqual(claims[0].sourceRefIds, [sourceId]);
  const page = new WikiPage({ userId: new mongoose.Types.ObjectId(), title: 'Owned page', slug: 'owned-page', body: doc, claims, sourceRefs: refs, citations });
  assert.strictEqual(page.validateSync(), undefined, 'unknown and its history must cast through the real schema');
  const retained = JSON.parse(JSON.stringify(page.toObject()));
  const owner = serializeWikiPage(retained);
  const shared = serializePublicWikiPage(retained);
  assert.strictEqual(grade(owner.body), 'unknown');
  assert.strictEqual(grade(shared.body), 'unknown');
  assert.strictEqual(derive(owner.body, retained.claims)[0].support, 'unknown');
  assert.strictEqual(derive(owner.body, retained.claims)[0].history.length, 1, 'an unchanged reload creates no revision churn');
  assert.strictEqual(owner.body.content[0].content[0].text, words);
  assert.ok(!JSON.stringify(shared).includes(sourceId), 'shared bodies must not leak private source identities');
  assert.strictEqual(grade(doc), support, 'serialization must not mutate the retained body');
  const graph = buildWikiPageGraphRows({ page: retained, userId: String(page.userId) });
  assert.ok(!graph.some(row => row.relationType === 'supports' && row.toType === 'wiki_claim'));
  assert.ok(graph.some(row => row.relationType === 'needs_review'));
  const comparison = compareClaimLedgers({ beforeClaims: [{ ...claims[0], citationIds: [], sourceRefIds: [] }], afterClaims: claims });
  assert.strictEqual(comparison.counts.gainedSupport, 0, 'new attachments do not assess unknown evidence');
  assert.strictEqual(comparison.counts.evidenceRefreshed, 1);
  const patch = buildClaimBodyPatch({ beforeBody: body(support), afterBody: body(support, 'Explicitly chosen new wording.'), targetClaimId: 'owned-claim', beforeClaim: derive(body(support))[0], proposedClaim: derive(body(support, 'Explicitly chosen new wording.'))[0], afterSourceRefs: refs, afterCitations: citations });
  assert.strictEqual(grade(patch.body), support, 'bounded proposal validation must not rewrite retained mark attributes');
}

for (const support of ['supported', 'partial', 'unsupported', 'conflicted']) {
  const assessed = derive(body(support));
  assessed[0].epistemicStatus = 'supported_interpretation';
  assessed[0].implication = 'The owner chose this implication.';
  const legacy = body(undefined);
  const claims = derive(legacy, assessed);
  assert.strictEqual(claims[0].support, support, 'exact retained assessments survive an unrelated legacy edit');
  assert.strictEqual(claims[0].implication, assessed[0].implication);
  assert.strictEqual(claims[0].history.length, assessed[0].history.length);
  for (const [key, value] of Object.entries(assessed[0].history[0])) assert.deepStrictEqual(claims[0].history[0][key], value, `retained history field ${key}`);
  const serialized = serializeWikiPage({ body: legacy, title: 'Owned page', claims: assessed, sourceRefs: refs, citations });
  assert.strictEqual(grade(serialized.body), support);
  assert.strictEqual(grade(legacy), undefined, 'legacy hydration is a projection, not a migration');
  assert.strictEqual(derive(body(undefined, 'Changed authored words.'), assessed)[0].support, 'unknown');
  assert.strictEqual(derive(body(undefined, words, [], 'owned-claim'), assessed)[0].support, 'unknown');
  assert.strictEqual(derive(body(undefined, words, [1], 'different-claim'), assessed)[0].support, 'unknown');
  assert.strictEqual(derive(body('unknown'), assessed)[0].support, 'unknown', 'explicit unknown must not resurrect an earlier assessment');
}

const retainedUnknown = derive(body('unknown'))[0];
const retainedSupported = derive(body('supported'))[0];
retainedUnknown.implication = 'Owner implication A';
retainedSupported.implication = 'Owner implication B';
retainedSupported.resolutionCriteria = 'Owner criterion';
retainedSupported.falsifierIds = ['owner-falsifier'];
retainedSupported.verdicts = [{ note: 'Owner verdict' }];
for (const previous of [[retainedUnknown, retainedSupported], [retainedSupported, retainedUnknown]]) {
  const saved = JSON.stringify(previous);
  assert.throws(() => derive(body(undefined), previous), error => error.code === 'claim_identity_conflict' && error.statusCode === 409);
  assert.strictEqual(JSON.stringify(previous), saved, 'review conflict preserves all authored metadata and history');
  const projection = serializeWikiPage({ body: body(undefined), claims: previous, sourceRefs: refs, citations });
  assert.strictEqual(grade(projection.body), 'unknown');
  assert.ok(projection.claims.every(claim => claim.support === 'unknown' && claim.confidence === 0 && !claim.lastVerifiedAt));
  assert.deepStrictEqual(projection.claims.map(claim => claim.implication), previous.map(claim => claim.implication));
  assert.strictEqual(JSON.stringify(previous), saved);
  assert.strictEqual(grade(serializeWikiPage({ body: body('supported'), claims: previous, sourceRefs: refs, citations }).body), 'unknown');
  assert.strictEqual(grade(serializePublicWikiPage({ title: 'Owned page', body: body('supported'), claims: previous, sourceRefs: refs, citations }).body), 'unknown');
}
const legacyNulls = { ...retainedSupported, citationIds: null, sourceRefIds: null, contradictedByCitationIds: null };
assert.strictEqual(derive(body(undefined), [null, legacyNulls])[0].support, 'unknown');
assert.strictEqual(grade(serializeWikiPage({ body: body(undefined), claims: [legacyNulls], sourceRefs: refs, citations }).body), 'unknown');

const split = body('supported');
split.content[0].content = [
  { ...split.content[0].content[0], text: 'An owned sentence' },
  { ...body('unknown').content[0].content[0], text: 'whose relationship has not been assessed.' }
];
assert.strictEqual(derive(split)[0].support, 'unknown', 'a known fragment cannot assess an unknown fragment');
const brokenLine = body('unknown');
const firstFragment = brokenLine.content[0].content[0];
brokenLine.content[0].content = [{ ...firstFragment, text: 'An owned statement' }, { type: 'hardBreak', marks: firstFragment.marks }, { ...firstFragment, text: 'awaiting an assessment.' }];
assert.strictEqual(derive(brokenLine)[0].support, 'unknown', 'a marked Shift-Enter is one continuous claim');
delete brokenLine.content[0].content[1].marks;
assert.strictEqual(derive(brokenLine)[0].support, 'unknown', 'an unmarked StarterKit Shift-Enter is also one continuous claim');
const splitParagraphs = body('unknown');
splitParagraphs.content.push(body('unknown', 'The same sentence continues after Enter.').content[0]);
assert.strictEqual(derive(splitParagraphs)[0].support, 'unknown', 'ordinary Enter preserves a consecutive claim run');
const splitProjection = serializeWikiPage({ body: split, claims: [], sourceRefs: refs, citations });
assert.strictEqual(splitProjection.body.content[0].content[1].marks[0].attrs.support, 'unknown');
const duplicate = body('supported');
duplicate.content.push(body('unknown', 'Different words with a reused claim id.').content[0]);
const duplicatedProjection = serializeWikiPage({ body: duplicate, claims: [], sourceRefs: refs, citations });
assert.strictEqual(duplicatedProjection.body.content[1].content[0].marks[0].attrs.support, 'unknown');
const disjointDuplicate = JSON.parse(JSON.stringify(duplicate));
disjointDuplicate.content.splice(1, 0, { type: 'paragraph', content: [{ type: 'text', text: 'Other authored words intervene.' }] });
assert.throws(() => derive(disjointDuplicate), error => error.code === 'claim_identity_conflict');
assert.strictEqual(derive(body('unknown'))[0].support, 'unknown', 'correcting the pasted duplicate can save without an installed conflict');

const verdicts = derive(body('supported'));
for (const action of ['held_up', 'broke', 'partly', 'unresolvable', 'right_for_wrong_reasons']) {
  verdicts[0].history[0] = { ...verdicts[0].history[0], action, reason: 'Owner verdict reason', note: 'Owner verdict note', actorType: 'user', disposition: 'accepted' };
  const retainedVerdict = derive(body('supported'), verdicts)[0].history[0];
  assert.strictEqual(retainedVerdict.action, action);
  assert.strictEqual(retainedVerdict.reason, 'Owner verdict reason');
  assert.strictEqual(retainedVerdict.note, 'Owner verdict note');
  assert.strictEqual(retainedVerdict.actorType, 'user');
  assert.strictEqual(retainedVerdict.disposition, 'accepted');
}

const unknown = derive(body('unknown'));
const quality = __testables.evaluateWikiArticleQuality({ page: { title: 'Owned page' }, body: body('unknown'), claims: unknown, sourceRefs: refs });
assert.strictEqual(quality.metrics.supportedLike, 0);
assert.strictEqual(quality.metrics.unsupported, 1, 'unknown stays conservative in existing quality budgets');
console.log('ok - unknown support round-trips without assessment, identity loss or authored-history migration');
