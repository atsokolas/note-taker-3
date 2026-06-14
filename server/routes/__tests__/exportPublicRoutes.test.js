const assert = require('assert');
const express = require('express');

const { buildExportPublicRouter } = require('../exportPublicRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

class Query {
  constructor(value) {
    this.value = value;
  }

  select() {
    return this;
  }

  lean() {
    return Promise.resolve(this.value);
  }

  then(resolve, reject) {
    return Promise.resolve(this.value).then(resolve, reject);
  }
}

const fetchJson = async (url) => {
  const response = await fetch(url);
  const body = await response.json();
  return { response, body };
};

const createTagMeta = (concept) => ({
  findOne(query = {}) {
    if (query.slug === concept.slug && query.isPublic === true) {
      return new Query(concept);
    }
    return new Query(null);
  }
});

const createQuestionModel = (rows = []) => ({
  find(query = {}) {
    const userId = String(query.userId || '');
    const conceptMatchers = Array.isArray(query.$or) ? query.$or : [];
    const results = rows.filter((row) => {
      if (String(row.userId || '') !== userId) return false;
      return conceptMatchers.some((matcher) => (
        matcher.conceptName?.test?.(row.conceptName || '')
        || matcher.linkedTagName?.test?.(row.linkedTagName || '')
      ));
    });
    return new Query(results);
  }
});

const run = async () => {
  const concept = {
    userId: 'user-1',
    name: 'Opportunity Cost',
    description: 'Public concept framing.',
    slug: 'opportunity-cost',
    isPublic: true
  };
  const privateQuestionText = 'Should this private question publish by accident?';
  const app = express();
  app.use(express.json());
  app.use(buildExportPublicRouter({
    mongoose: { Types: { ObjectId: { isValid: () => false } } },
    authenticateToken: (_req, _res, next) => next(),
    NotebookEntry: {},
    createBlockId: () => 'block',
    ensureNotebookBlocks: () => {},
    buildNotebookMarkdown: () => '',
    slugify: (value = '') => String(value).toLowerCase().replace(/\s+/g, '-'),
    TagMeta: createTagMeta(concept),
    getConceptMeta: async () => concept,
    getConceptRelated: async () => ({
      highlights: [{ id: 'h1' }, { id: 'h2' }],
      articles: [{ id: 'a1' }]
    }),
    Question: createQuestionModel([{
      userId: 'user-1',
      conceptName: 'Opportunity Cost',
      text: privateQuestionText,
      status: 'open',
      updatedAt: new Date()
    }]),
    buildConceptMarkdown: () => ''
  }));

  const server = await listen(app);
  const { port } = server.address();
  try {
    const { response, body } = await fetchJson(`http://127.0.0.1:${port}/public/concepts/opportunity-cost`);
    assert.strictEqual(response.status, 200, body.error);
    assert.strictEqual(body.concept.name, 'Opportunity Cost');
    assert.strictEqual(body.relatedCounts.highlights, 2);
    assert.strictEqual(body.relatedCounts.articles, 1);
    assert.strictEqual(body.relatedCounts.questions, 1);
    assert.deepStrictEqual(body.questions, []);
    assert.ok(!JSON.stringify(body).includes(privateQuestionText));
  } finally {
    server.close();
  }
};

run()
  .then(() => {
    console.log('exportPublicRoutes.test.js passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
