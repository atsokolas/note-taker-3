const assert = require('assert');
const {
  createConceptInvestigationFixture
} = require('./conceptInvestigationFixture');

const run = () => {
  const first = createConceptInvestigationFixture();
  const replay = createConceptInvestigationFixture();

  assert.deepStrictEqual(replay, first);
  assert.strictEqual(first.currentWiki.acceptanceState, 'unverified');
  assert.strictEqual(first.currentWiki.claim.claimId, first.chain.claimId);
  assert.strictEqual(first.candidateRevision.promotionStatus, 'candidate');
  assert.strictEqual(first.pendingDraft.status, 'pending');
  assert.ok(first.pendingDraft.signature.includes(first.candidateRevision._id));

  const cards = first.concept.ideaWorkbench.cards;
  const support = cards.find(card => card.id === 'fixture-support-card');
  const tension = cards.find(card => card.id === 'fixture-tension-card');
  const article = cards.find(card => card.id === 'fixture-article-context-card');
  const note = cards.find(card => card.id === 'fixture-note-context-card');
  assert.strictEqual(support.zone, 'supports');
  assert.strictEqual(tension.zone, 'contradictions');
  assert.strictEqual(article.zone, 'workspace');
  assert.strictEqual(note.zone, 'workspace');
  assert.strictEqual(
    support.sourceKey,
    `highlight:${first.ids.supportHighlight}`
  );
  assert.strictEqual(
    tension.sourceKey,
    `highlight:${first.ids.highlight}`
  );
  assert.strictEqual(article.sourceKey, `article:${first.ids.article}`);
  assert.strictEqual(note.sourceKey, `note:${first.ids.note}`);
  assert.ok(first.linkedArticle.highlights.some(
    highlight => highlight._id === first.ids.supportHighlight
  ));
  assert.ok(first.linkedArticle.highlights.some(
    highlight => highlight._id === first.ids.highlight
  ));
  assert.strictEqual(first.concept.userId, first.ids.user);
  assert.notStrictEqual(first.foreignArticle.userId, first.ids.user);

  console.log('concept investigation fixture tests passed');
};

run();
