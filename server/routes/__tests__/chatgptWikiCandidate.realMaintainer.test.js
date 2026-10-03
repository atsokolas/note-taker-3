/* Deterministic model response injected through maintainWikiPage's existing
 * chat interface. Routing, normalization, quality evaluation and candidate
 * publication are real; storage/auth are bounded in-memory fixtures. */
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { WikiPage: Document } = require('../../models');
const { buildWikiRouter } = require('../wikiRoutes');
const { maintainWikiPage } = require('../../services/wikiMaintenanceService');
const { snapshotPage } = require('../../services/wikiRevisionService');
const paragraphs = [
  `Retrieval practice starts with attempting to recall information before looking at an answer. The attempt makes a gap visible because the learner must produce a response rather than recognize familiar words on a page. For example, a learner closes a chapter and explains its main argument from memory before checking the explanation against the text. Retrieval practice therefore separates fluent reading from available knowledge. A correct response can show access to the idea, while an incorrect response identifies material that needs correction. This procedure measures a particular recall attempt; it does not establish that the learner can apply the idea in every unfamiliar setting.`,
  `Retrieval practice depends on feedback that identifies the difference between the attempted response and the intended answer. A learner who guesses incorrectly needs a correction before repeating the same mistake. Because feedback provides the missing information, the next attempt can test whether the correction became available rather than whether the learner remembers an error. In a vocabulary exercise, an incorrect definition should be followed by the correct definition and a later prompt for that word. Retrieval practice with no feedback may expose uncertainty without resolving it. The useful boundary is whether the task supplies an answer that is trustworthy enough to guide correction.`,
  `Retrieval practice can be spaced across separate sessions instead of concentrated into a single sitting. A delay changes the recall task because the learner can no longer rely only on the immediately preceding explanation. For example, a student answers a question after a lesson, returns to it the following day, and attempts a related question during a later review. The sequence makes forgetting observable and creates opportunities to repair it. Retrieval practice is not a claim that every delay is equally useful. If a gap becomes so long that no response is possible, a shorter interval or renewed instruction may be needed before another meaningful attempt.`,
  `Retrieval practice supports more useful diagnosis when a prompt asks for an explanation rather than a familiar label. A learner can recognize a term while being unable to explain the relationships that make the term useful. Asking why a particular method works exposes those relationships because the response must connect causes with consequences. For example, a learner explains why feedback after a failed attempt changes the next attempt instead of merely naming feedback. Retrieval practice of explanations therefore checks an aspect of understanding that a recognition question can miss. This distinction does not make every recognition task worthless; the appropriate prompt depends on the knowledge being assessed.`,
  `Retrieval practice requires a distinction between successful recall and transfer to a changed situation. Producing a remembered answer to a repeated question can demonstrate access to that answer without demonstrating flexible use. A teacher can test the boundary by changing the example while keeping the underlying principle constant. For instance, a learner who explains a spacing schedule for vocabulary can be asked how a similar schedule might support procedural practice. Retrieval practice then reveals whether the learner connects the principle to a new case. A single changed example remains a limited test, so the result should not be presented as universal competence or a guarantee of future performance.`,
  `Retrieval practice becomes a maintained learning process when attempts, feedback, and later checks are connected. The teacher selects a target, observes a response, identifies the relevant gap, supplies a correction, and returns to the target after enough time to test access again. Because each step changes what the next step can reveal, the process is more informative than counting how long a learner looked at material. For example, a record can distinguish an initially incorrect explanation from a later correct explanation rather than treating both sessions as equal exposure. Retrieval practice remains bounded by prompt quality, feedback reliability, and the specific performances actually observed.`
];
const userId = new mongoose.Types.ObjectId();
const page = new Document({ userId, title: 'Retrieval Practice', slug: 'retrieval-practice', pageType: 'topic', status: 'draft', visibility: 'private', sourceScope: 'selected_sources', plainText: 'The reader retains this accepted sentence.', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The reader retains this accepted sentence.' }] }] }, sourceRefs: paragraphs.map((snippet, index) => ({ type: 'external', objectId: new mongoose.Types.ObjectId(), title: `Retrieval Practice evidence ${index + 1}`, url: `https://fixture.example/retrieval/${index + 1}`, snippet, provider: 'synthetic-local-fixture', addedBy: 'user' })) });
let stored = page.toObject();
page.save = async () => { stored = page.toObject(); return page; };
const query = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const PageModel = { findOne: filter => query(String(filter._id) === String(page._id) && (!filter.userId || String(filter.userId) === String(userId)) ? page : null), find: () => query([]) };
const revisions = [];
function Revision(payload) { Object.assign(this, payload); this._id = new mongoose.Types.ObjectId(); }
Revision.prototype.save = async function () { revisions.push(this); return this; };
Revision.findOne = () => query(null);
let modelCalls = 0;
let evaluatedQuality;
const generated = { title: page.title, article: { summary: { text: 'Retrieval practice uses a recall attempt, corrective feedback, and a later check to reveal what the learner can produce and what still needs repair.', citationIndexes: [1, 2, 6], support: 'supported' }, sections: paragraphs.map((text, index) => ({ heading: ['Recall before review', 'Feedback repairs an observed gap', 'Spacing makes forgetting visible', 'Explanations expose causal understanding', 'Transfer tests the recall boundary', 'Connecting attempts into a learning process'][index], paragraphs: [{ text, citationIndexes: [index + 1], support: 'supported' }], bullets: [] })) }, sourceIndexesUsed: [1, 2, 3, 4, 5, 6], maintenance: { summary: 'Prepared a source-backed review candidate.', changelog: [], health: {} } };
let modelOutput = generated;
const app = express(); app.use(express.json());
app.use(buildWikiRouter({ WikiPage: PageModel, WikiRevision: Revision,
  authenticateToken: (req, _res, next) => { req.user = { id: String(userId) }; req.agentToken = { id: 'fixture-oauth', scopes: ['read','agent-write'], accessProfile: 'chatgpt' }; next(); },
  maintainWikiPage: async args => {
    const maintained = await maintainWikiPage({ ...args, models: { WikiPage: PageModel }, isConfigured: () => true, chat: async request => {
      modelCalls++; assert.equal(request.route, 'artifact_draft');
      assert.ok(request.messages[1].content.includes('Retrieval Practice evidence'));
      return { model: 'deterministic-local-fixture', provider: 'test', text: JSON.stringify(modelOutput) };
    } });
    evaluatedQuality = JSON.parse(JSON.stringify(maintained.aiState.quality)); return maintained;
  }
}));
(async () => {
  const before = snapshotPage(page);
  const server = await new Promise(resolve => { const started = app.listen(0, '127.0.0.1', () => resolve(started)); });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${origin}/api/wiki/pages/${page._id}/ai/draft`, { method: 'POST' });
    const body = await response.json();
    assert.equal(response.status, 202, JSON.stringify(body));
    assert.equal(modelCalls, 1, 'real maintainer must consume successful deterministic model output without rebuild/fallback');
    assert.equal(evaluatedQuality.ok, true, JSON.stringify(evaluatedQuality));
    assert.ok(evaluatedQuality.metrics.words >= 450, JSON.stringify(evaluatedQuality));
    assert.deepEqual(evaluatedQuality.failures, []);
    assert.equal(body.firstHeadReview.status, 'awaiting_acceptance');
    assert.equal(body.aiState.candidateStatus, 'awaiting_maintenance_acceptance');
    assert.equal(stored.plainText, before.plainText); assert.deepEqual(stored.body, before.body);
    const candidate = revisions.find(revision => revision.promotionStatus === 'candidate');
    assert.ok(candidate); assert.equal(candidate.quality.ok, true); assert.match(candidate.after.plainText, /Feedback repairs an observed gap/);
    const blocked = await fetch(`${origin}/api/wiki/pages/${page._id}/research-head/adopt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'ADOPT CURRENT TRUSTED HEAD' }) });
    assert.equal(blocked.status, 403); assert.equal(stored.plainText, before.plainText);
    // A valid delivery containing insufficient evidence-bearing prose fails
    // the unchanged quality contract, distinguishing rejection from broken auth.
    modelOutput = { ...generated, article: { ...generated.article, sections: generated.article.sections.slice(0, 2) }, sourceIndexesUsed: [1, 2] };
    const sparseResponse = await fetch(`${origin}/api/wiki/pages/${page._id}/ai/draft`, { method: 'POST' });
    const sparse = await sparseResponse.json();
    assert.equal(sparseResponse.status, 422, JSON.stringify(sparse));
    assert.equal(sparse.code, 'WIKI_CANDIDATE_REJECTED');
    assert.equal(evaluatedQuality.ok, false);
    assert.ok(evaluatedQuality.failures.some(failure => /too thin|450|words/.test(failure)), JSON.stringify(evaluatedQuality));
    assert.equal(stored.plainText, before.plainText); assert.deepEqual(stored.body, before.body);
    console.log(JSON.stringify({ passed: true, fixture: 'deterministic successful model output through real Wiki route, maintainer, quality evaluator and candidate holding', positiveModelCalls: 1, positiveQuality: candidate.quality, negativeModelCalls: modelCalls - 1, negativeQuality: evaluatedQuality, sparseStatus: sparseResponse.status, responseStatus: response.status, candidateStatus: body.aiState.candidateStatus, acceptedHeadUnchanged: true, agentAdoptionStatus: blocked.status, limitations: 'In-memory auth/storage; no real model generation, production data, consent, grant or Mongo persistence.' }, null, 2));
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
