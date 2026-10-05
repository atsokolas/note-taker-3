const crypto = require('crypto');
const mongoose = require('mongoose');
const { CASES } = require('./cases');
const { SOURCES, seedLibrary, libraryTexts } = require('./library');
const { scoreCase, summarize, regressions } = require('./score');

// Questions are asked from the same surfaces the rail describes in the app.
const contextFor = (surface, ids) => {
  if (surface.startsWith('article:')) {
    const key = surface.slice('article:'.length);
    return { type: 'article', id: ids[key], title: SOURCES[key].title, metadata: { room: 'library', objectType: 'article' } };
  }
  if (surface === 'library') {
    return { type: 'workspace', id: 'library', title: 'Library', metadata: { room: 'library', objectType: 'library_workspace' } };
  }
  return { type: 'think', id: 'think', title: 'Think', metadata: { room: 'think', objectType: 'think_workspace' } };
};

// Never the app's MONGODB_URI: the eval seeds and drops its own database, so it
// takes an explicit throwaway server or starts one in memory.
const openDatabase = async () => {
  const explicit = String(process.env.AGENT_EVAL_MONGODB_URI || '').trim();
  if (explicit) {
    const dbName = `noeis_agent_eval_${crypto.randomBytes(4).toString('hex')}`;
    await mongoose.connect(explicit, { dbName });
    return async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); };
  }
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
  return async () => { await mongoose.disconnect(); await server.stop(); };
};

const runAgentEval = async ({ only = [], baseline = null, onCase = () => {} } = {}) => {
  const close = await openDatabase();
  try {
    const { Article, NotebookEntry, TagMeta, WikiPage } = require('../models');
    // The partner resolves these lazily by name; loading the model index
    // registers them.
    const { generateCollaborativeReply } = require('../services/collaborativeAgentService');
    // Production has the text indexes retrieval reads; a fresh database
    // builds them here before anything is asked.
    await Promise.all([Article.init(), NotebookEntry.init(), TagMeta.init()]);
    const userId = new mongoose.Types.ObjectId();
    const ids = await seedLibrary({ userId, Article, NotebookEntry, TagMeta, WikiPage });
    const texts = libraryTexts();
    const cases = only.length ? CASES.filter(item => only.includes(item.id)) : CASES;

    const scored = [];
    for (const evalCase of cases) {
      const startedAt = Date.now();
      let result;
      try {
        result = await generateCollaborativeReply({
          userId: String(userId),
          message: evalCase.ask,
          context: contextFor(evalCase.surface, ids)
        });
      } catch (error) {
        result = { reply: '', error: error.message };
      }
      const item = { ...scoreCase({ evalCase, result, ids, texts }), latencyMs: Date.now() - startedAt };
      scored.push(item);
      onCase(item);
    }
    const summary = summarize(scored);
    return { summary, regressions: regressions(summary, baseline), cases: scored };
  } finally {
    await close();
  }
};

module.exports = { runAgentEval, __testables: { contextFor } };
