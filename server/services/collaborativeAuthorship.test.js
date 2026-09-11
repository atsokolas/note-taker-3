const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Capture the actual generation boundary without making a model request.
const aiPath = require.resolve('../ai/hfTextClient');
const captured = [];
require.cache[aiPath] = { id: aiPath, filename: aiPath, loaded: true, exports: {
  isTextGenerationConfigured: () => true,
  chatComplete: async payload => { captured.push(payload); return { text: 'Here is a possible revision in your voice.', model: 'fixture', provider: 'fixture' }; }
} };
const { generateCollaborativeReply } = require('./collaborativeAgentService');

const owner = '64a000000000000000000001';
const pageId = '64a000000000000000000002';
const articleId = '64a000000000000000000003';
const highlightId = '64a000000000000000000004';
const sourceId = '64a000000000000000000005';
const primaryId = '64a000000000000000000006';
const primaryHighlight = '64a000000000000000000007';
const original = 'Children need room to make mistakes.';
const selected = 'A recoverable mistake leaves the next attempt possible.';
const page = { _id: pageId, userId: owner, title: 'Parenting', slug: 'parenting', plainText: original,
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: original, marks: [{ type: 'claim', attrs: { claimId: 'claim-1' } }] }] }] },
  claims: [{ claimId: 'claim-1', text: original, sourceRefIds: [sourceId] }],
  sourceRefs: [{ _id: sourceId, type: 'highlight', objectId: primaryHighlight, parentObjectId: primaryId, title: 'Room to learn', snippet: original }]
};
const articles = [
  { _id: articleId, userId: owner, title: 'Nomad', content: selected, highlights: [{ _id: highlightId, text: selected }] },
  { _id: primaryId, userId: owner, title: 'Room to learn', content: original, highlights: [{ _id: primaryHighlight, text: original }] }
];
const query = value => ({ select() { return this; }, lean() { return Promise.resolve(value); }, sort() { return this; }, limit() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const models = {
  WikiPage: { findOne: filter => query(String(filter.userId) === owner && String(filter._id) === pageId ? page : null) },
  Article: {
    find: () => query([]),
    findOne: filter => query(articles.find(article => (
      String(filter.userId) === owner
      && (!filter._id || article._id === String(filter._id))
      && (!filter['highlights._id'] || article.highlights.some(highlight => highlight._id === String(filter['highlights._id'])))
    )))
  },
  NotebookEntry: { find: () => query([]) }, TagMeta: { find: () => query([]) }, Connection: { find: () => query([]) }, Question: { find: () => query([]) }
};
const originalModel = mongoose.model;
mongoose.model = name => models[name];

const run = async () => {
  const context = { type: 'wiki_page', id: pageId, pageId, claimId: 'claim-1', metadata: { exploration: {
    pageId, claimId: 'claim-1', draft: { originalText: original, writing: 'My exact words.\nA second line.', question: 'Who decides what is recoverable?', pressure: { against: original, premise: 'Suppose no retry is possible.' }, selectedSource: { articleId, highlightId, passage: selected, articleTitle: 'FORGED TITLE', aroundBefore: 'FORGED CONTEXT' } }
  } } };
  const reply = await generateCollaborativeReply({ userId: owner, message: 'Rewrite my paragraph in my voice.', context });
  assert.equal(reply.reply, 'Here is a possible revision in your voice.');
  assert.equal(reply.intent.interactionMode, 'answer');
  assert.equal(reply.proposalBundle, null, 'A requested prose suggestion is not an accepted edit.');
  assert.equal(captured.length, 1);
  const prompt = captured[0].messages.map(item => item.content).join('\n');
  for (const text of [original, selected, 'My exact words.', 'A second line.', 'Who decides what is recoverable?', 'Suppose no retry is possible.', 'Room to learn', 'Nomad']) assert.ok(prompt.includes(text), text);
  assert.ok(!prompt.includes('FORGED'), 'Names and source context must come from owned records.');
  const foreignContext = structuredClone(context);
  foreignContext.metadata.exploration.draft.selectedSource.articleId = '64a000000000000000000099';
  await assert.rejects(generateCollaborativeReply({ userId: owner, message: 'Read this.', context: foreignContext }), error => error.code === 'source_not_found');
  const changedOrigin = structuredClone(context);
  changedOrigin.metadata.exploration.draft.originalText = 'An earlier sentence.';
  await assert.rejects(generateCollaborativeReply({ userId: owner, message: 'Read this.', context: changedOrigin }), error => error.code === 'stale_origin');
  assert.equal(captured.length, 1, 'Rejected context must never reach a model.');
  console.log('collaborative authorship generation boundary: PASS (0 live model calls)');
};
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { mongoose.model = originalModel; });
