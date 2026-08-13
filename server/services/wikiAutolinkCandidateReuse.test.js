const assert = require('assert');
const mongoose = require('mongoose');
const { WikiPage } = require('../models');
const { maintainWikiPage } = require('./wikiMaintenanceService');
const { findAutolinkSuggestions } = require('./wikiAutolinkService');

// The autolink candidate set depends on the owner and the target page, never on
// the prose being linked. Maintenance re-links after every quality repair, so
// fetching inside the matcher made a two-repair build scan the wiki three times
// for identical rows. These tests pin that the fetch happens once and that
// matching still runs against each attempt's own text.

const countingModel = (counts, name, docs = []) => ({
  find: () => {
    counts[name] = (counts[name] || 0) + 1;
    return {
      sort() { return this; },
      limit() { return this; },
      lean: async () => docs
    };
  }
});

const run = async () => {
  // 1. Injected candidates are used verbatim and no query is issued.
  {
    let queried = 0;
    const models = {
      WikiPage: {
        find: () => {
          queried += 1;
          return { sort() { return this; }, limit() { return this; }, lean: async () => [] };
        }
      }
    };
    const result = await findAutolinkSuggestions({
      targetPage: { _id: 'target', title: 'Target', plainText: 'Compounding matters here.' },
      userId: 'user-1',
      models,
      candidatePages: [{
        _id: 'other',
        title: 'Compounding',
        slug: 'compounding',
        pageType: 'topic',
        plainText: 'Compounding explained.'
      }]
    });
    assert.equal(queried, 0, 'injected candidates must not trigger a fetch');
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].title, 'Compounding');
  }

  // 2. Without injection the behaviour is unchanged — it still fetches.
  {
    let queried = 0;
    const models = {
      WikiPage: {
        find: () => {
          queried += 1;
          return {
            sort() { return this; },
            limit() { return this; },
            lean: async () => [{
              _id: 'other',
              title: 'Compounding',
              slug: 'compounding',
              pageType: 'topic',
              plainText: 'Compounding explained.'
            }]
          };
        }
      }
    };
    const result = await findAutolinkSuggestions({
      targetPage: { _id: 'target', title: 'Target', plainText: 'Compounding matters here.' },
      userId: 'user-1',
      models
    });
    assert.equal(queried, 1);
    assert.equal(result.suggestions.length, 1);
  }

  // 3. Matching still reflects the attempt's own prose, so reuse cannot freeze
  //    links to an earlier draft.
  {
    const candidatePages = [{
      _id: 'other',
      title: 'Compounding',
      slug: 'compounding',
      pageType: 'topic',
      plainText: 'Compounding explained.'
    }];
    const mentions = await findAutolinkSuggestions({
      targetPage: { _id: 'target', title: 'Target', plainText: 'Compounding matters here.' },
      userId: 'user-1',
      models: {},
      candidatePages
    });
    const noMentions = await findAutolinkSuggestions({
      targetPage: { _id: 'target', title: 'Target', plainText: 'This draft never names the topic.' },
      userId: 'user-1',
      models: {},
      candidatePages
    });
    assert.equal(mentions.suggestions.length, 1);
    assert.equal(noMentions.suggestions.length, 0);
  }

  // 4. End to end: a full maintenance build fetches the candidate set once,
  //    however many repair passes it makes.
  {
    const counts = {};
    const userId = new mongoose.Types.ObjectId();
    const page = new WikiPage({
      userId,
      title: 'Parenting',
      slug: 'autolink-reuse',
      pageType: 'topic',
      plainText: 'Existing note.',
      sourceRefs: [],
      claims: [],
      citations: [],
      aiState: {}
    });
    const articles = [1, 2, 3].map(index => ({
      _id: new mongoose.Types.ObjectId(),
      userId,
      title: `Parenting source ${index}`,
      content: 'Parenting responsive interaction and predictable routines shape early development. '.repeat(6),
      updatedAt: new Date()
    }));
    await maintainWikiPage({
      page,
      userId,
      // No model configured: the build takes the deterministic path, which
      // still materializes and links exactly like a model-backed one.
      isConfigured: () => false,
      models: {
        Article: countingModel(counts, 'Article', articles),
        NotebookEntry: countingModel(counts, 'NotebookEntry'),
        TagMeta: countingModel(counts, 'TagMeta'),
        Question: countingModel(counts, 'Question'),
        WikiPage: countingModel(counts, 'WikiPage')
      },
      now: new Date()
    });
    // One known-pages lookup plus one autolink candidate load. Before this
    // change the autolink load alone ran once per materialize pass.
    assert.equal(counts.WikiPage, 2, `expected 2 WikiPage queries, got ${counts.WikiPage}`);
  }

  console.log('wikiAutolink candidate reuse tests passed');
};

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
