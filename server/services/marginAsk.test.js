const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// The Partner asked from the reader's margin: the same turn as ⌘J, given the
// paragraph and the passage its note points to. No model request is made.
const aiPath = require.resolve('../ai/hfTextClient');
const captured = [];
let replies = [];
require.cache[aiPath] = { id: aiPath, filename: aiPath, loaded: true, exports: {
  isTextGenerationConfigured: () => true,
  chatComplete: async (payload) => {
    captured.push(payload);
    return { text: replies.shift() || '', model: 'fixture', provider: 'fixture' };
  }
} };
const { generateCollaborativeReply } = require('./collaborativeAgentService');

const owner = '64a000000000000000000001';
const stranger = '64a000000000000000000009';
const readingId = '64a000000000000000000003';
const markedId = '64a000000000000000000004';
const highlightId = '64a000000000000000000005';
const foreignHighlightId = '64a000000000000000000006';
const paragraph = 'Every expert forgets the obvious step at least once, and the cost grows with the stakes.';
const marked = 'A checklist is not a crutch for the inexpert but a net for the expert who forgets.';
const articles = [
  { _id: readingId, userId: owner, title: 'On error', content: `<p>${paragraph}</p>`, highlights: [] },
  { _id: markedId, userId: owner, title: 'The Checklist Manifesto', content: marked, highlights: [{ _id: highlightId, text: marked, note: 'Nets, not crutches.' }] },
  { _id: '64a00000000000000000000a', userId: stranger, title: 'Someone else', content: 'Private words.', highlights: [{ _id: foreignHighlightId, text: 'A stranger kept this sentence for themselves alone.' }] }
];
const query = value => ({ select() { return this; }, lean() { return Promise.resolve(value); }, sort() { return this; }, limit() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const models = {
  Article: {
    find: () => query([]),
    aggregate: async () => [],
    countDocuments: async () => 0,
    findOne: filter => query(articles.find(article => (
      String(filter.userId) === article.userId
      && (!filter._id || article._id === String(filter._id))
      && (!filter['highlights._id'] || article.highlights.some(highlight => highlight._id === String(filter['highlights._id'])))
    )) || null)
  },
  NotebookEntry: { find: () => query([]), countDocuments: async () => 0 },
  TagMeta: { find: () => query([]), countDocuments: async () => 0 },
  Connection: { find: () => query([]) },
  Question: { find: () => query([]) }
};
const originalModel = mongoose.model;
mongoose.model = (name) => {
  if (!models[name]) throw new Error(`no ${name}`);
  return models[name];
};

const context = margin => ({ type: 'article', id: readingId, title: 'On error', metadata: { room: 'library' }, margin });
const promptOf = call => call.messages.map(item => String(item.content || '')).join('\n');

const run = async () => {
  // The paragraph and the noted passage, read from the reader's own highlight.
  replies = ['The note answers it: “a net for the expert who forgets.”'];
  const answered = await generateCollaborativeReply({
    userId: owner,
    message: 'How does this paragraph bear on what I marked in The Checklist Manifesto?',
    context: context({ paragraph, highlightId, selection: '' })
  });
  assert.equal(answered.mode, 'hf_chat');
  const prompt = promptOf(captured[0]);
  assert.ok(prompt.includes(`The paragraph the reader is at:\n"""${paragraph}"""`));
  assert.ok(prompt.includes(`Beside it, a passage they marked in The Checklist Manifesto:\n"""${marked} Your note: Nets, not crutches."""`));
  assert.deepEqual(answered.quotes, [{ quote: 'a net for the expert who forgets.', type: 'article', id: markedId, title: 'The Checklist Manifesto' }]);
  assert.ok(answered.citations.some(item => item.id === markedId), 'A quoted note passage is a citation.');

  // A highlight that is not the reader's is never read into the turn.
  captured.length = 0;
  replies = ['Nothing in your library speaks to it.'];
  await generateCollaborativeReply({ userId: owner, message: 'And this?', context: context({ paragraph, highlightId: foreignHighlightId }) });
  assert.ok(!promptOf(captured[0]).includes('stranger'), 'Another reader’s passage stays theirs.');
  assert.ok(!promptOf(captured[0]).includes('Beside it, a passage'));

  // An invented quotation is refused twice over, and nothing is attributed to it.
  captured.length = 0;
  replies = ['It says “the expert never forgets anything at all here.”', 'Still “the expert never forgets anything at all here.”'];
  const refused = await generateCollaborativeReply({ userId: owner, message: 'What does it say?', context: context({ paragraph, highlightId }) });
  assert.equal(captured.length, 2, 'The quotation is checked and the turn asked to rewrite once.');
  assert.equal(refused.mode, 'internal_only');
  assert.ok(!refused.reply.includes('never forgets anything'));
  assert.ok(!refused.quotes.some(item => item.quote.includes('never forgets')));

  // Margin context means nothing outside an article.
  captured.length = 0;
  replies = ['A reply.'];
  await generateCollaborativeReply({ userId: owner, message: 'Hello there', context: { type: 'workspace', id: 'library', metadata: { room: 'library' }, margin: { paragraph, highlightId } } });
  assert.ok(!promptOf(captured[0]).includes('The paragraph the reader is at'));

  console.log('margin ask: PASS (0 live model calls)');
};
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { mongoose.model = originalModel; });
