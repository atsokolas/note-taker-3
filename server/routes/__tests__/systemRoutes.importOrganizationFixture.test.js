const assert = require('assert');
const express = require('express');
const { buildSystemRouter } = require('../systemRoutes');

const getByPath = (input, path) => String(path || '')
  .split('.')
  .filter(Boolean)
  .reduce((value, key) => (value && value[key] !== undefined ? value[key] : undefined), input);

const matchesQuery = (doc, query = {}) => Object.entries(query).every(([key, expected]) => {
  if (key === '$or' && Array.isArray(expected)) {
    return expected.some(clause => matchesQuery(doc, clause));
  }
  const actual = getByPath(doc, key);
  if (expected instanceof RegExp) {
    return expected.test(String(actual || ''));
  }
  return String(actual || '') === String(expected || '');
});

const createModel = () => {
  const rows = [];
  let counter = 0;
  return {
    rows,
    async create(payload = {}) {
      counter += 1;
      const doc = {
        _id: payload._id || `${counter}`,
        ...payload,
        async save() {
          return this;
        }
      };
      rows.push(doc);
      return doc;
    },
    async deleteMany(query = {}) {
      const remaining = rows.filter((row) => !matchesQuery(row, query));
      rows.splice(0, rows.length, ...remaining);
      return { acknowledged: true };
    },
    find(query = {}) {
      const result = rows.filter((row) => matchesQuery(row, query));
      return {
        select() {
          return this;
        },
        lean() {
          return Promise.resolve(result);
        }
      };
    }
  };
};

const run = async () => {
  const IntegrationConnection = createModel();
  const ImportSession = createModel();
  const NotebookFolder = createModel();
  const NotebookEntry = createModel();
  const AgentThread = createModel();
  const AgentStructureProposal = createModel();
  const Article = createModel();
  const WikiPage = createModel();
  const Connection = createModel();
  const Question = createModel();

  const app = express();
  app.use(express.json());
  app.use(buildSystemRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011' };
      next();
    },
    parseAiServiceUrl: () => ({ origin: '', hasPath: false }),
    joinUrl: () => '',
    allowDebugFixtures: true,
    IntegrationConnection,
    ImportSession,
    NotebookFolder,
    NotebookEntry,
    AgentThread,
    AgentStructureProposal,
    Article,
    WikiPage,
    Connection,
    Question
  }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const createResponse = await fetch(`${baseUrl}/api/debug/fixtures/import-organization`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' }
    });
    assert.strictEqual(createResponse.status, 201);
    const createPayload = await createResponse.json();
    assert.ok(createPayload.fixture);
    assert.ok(createPayload.fixture.sessionId);
    assert.ok(createPayload.fixture.threadId);
    assert.ok(createPayload.fixture.proposalId);
    assert.strictEqual(IntegrationConnection.rows.length, 1);
    assert.strictEqual(ImportSession.rows.length, 1);
    assert.strictEqual(NotebookFolder.rows.length, 2);
    assert.strictEqual(NotebookEntry.rows.length, 1);
    assert.strictEqual(AgentThread.rows.length, 1);
    assert.strictEqual(AgentStructureProposal.rows.length, 1);
    assert.strictEqual(
      ImportSession.rows[0].agentSuggestions[0].scopeId,
      createPayload.fixture.sessionId,
      'Fixture route should backfill the organize suggestion scopeId.'
    );

    const clearResponse = await fetch(`${baseUrl}/api/debug/fixtures/import-organization`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' }
    });
    assert.strictEqual(clearResponse.status, 200);
    assert.strictEqual(IntegrationConnection.rows.length, 0);
    assert.strictEqual(ImportSession.rows.length, 0);
    assert.strictEqual(NotebookFolder.rows.length, 0);
    assert.strictEqual(NotebookEntry.rows.length, 0);
    assert.strictEqual(AgentThread.rows.length, 0);
    assert.strictEqual(AgentStructureProposal.rows.length, 0);

    const libraryFixtureResponse = await fetch(`${baseUrl}/api/debug/fixtures/library-source-provenance`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' }
    });
    assert.strictEqual(libraryFixtureResponse.status, 201);
    const libraryFixturePayload = await libraryFixtureResponse.json();
    assert.ok(libraryFixturePayload.fixture.articleId);
    assert.ok(libraryFixturePayload.fixture.highlightId);
    assert.ok(libraryFixturePayload.fixture.counterHighlightId);
    assert.ok(libraryFixturePayload.fixture.wikiPageId);
    assert.ok(libraryFixturePayload.fixture.discussionId);
    assert.ok(libraryFixturePayload.fixture.questionId);
    assert.ok(libraryFixturePayload.fixture.questionPath);
    assert.ok(libraryFixturePayload.fixture.wikiTalkPath);
    assert.strictEqual(Article.rows.length, 2);
    assert.strictEqual(WikiPage.rows.length, 1);
    assert.strictEqual(Question.rows.length, 1);
    assert.strictEqual(Connection.rows.length, 8);
    assert.strictEqual(WikiPage.rows[0].createdFrom.type, 'article');
    assert.ok(WikiPage.rows[0].claims[0].claimId);
    assert.strictEqual(WikiPage.rows[0].sourceRefs[0].type, 'article');
    assert.ok(WikiPage.rows[0].sourceRefs[0].objectId);
    assert.strictEqual(WikiPage.rows[0].discussions.length, 1);
    assert.strictEqual(WikiPage.rows[0].discussions[0]._id, libraryFixturePayload.fixture.discussionId);
    assert.deepStrictEqual(WikiPage.rows[0].discussions[0].citationIndexesUsed, [1]);
    assert.strictEqual(
      WikiPage.rows[0].discussions[0].answer.content[0].content[0].marks[0].attrs.citationIndexes[0],
      1
    );
    assert.strictEqual(Question.rows[0].blocks[0].challenge.enabled, true);
    assert.strictEqual(Question.rows[0].blocks[0].challenge.support.length, 1);
    assert.strictEqual(Question.rows[0].blocks[0].challenge.counter.length, 1);
    assert.ok(Connection.rows.some(row => row.fromType === 'highlight' && row.toType === 'wiki_page'));
    assert.ok(Connection.rows.some(row => row.fromType === 'wiki_page' && row.toType === 'highlight'));
    assert.ok(Connection.rows.some(row => row.fromType === 'article' && row.toType === 'wiki_page'));
    assert.ok(Connection.rows.some(row => row.fromType === 'wiki_page' && row.toType === 'article' && row.relationType === 'supported_by'));
    assert.ok(Connection.rows.some(row => row.toType === 'question' && row.relationType === 'supports' && row.scopeType === 'question'));
    assert.ok(Connection.rows.some(row => row.toType === 'question' && row.relationType === 'contradicts' && row.scopeType === 'question'));

    const clearLibraryFixtureResponse = await fetch(`${baseUrl}/api/debug/fixtures/library-source-provenance`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-token' }
    });
    assert.strictEqual(clearLibraryFixtureResponse.status, 200);
    assert.strictEqual(Article.rows.length, 0);
    assert.strictEqual(WikiPage.rows.length, 0);
    assert.strictEqual(Question.rows.length, 0);
    assert.strictEqual(Connection.rows.length, 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  const lockedApp = express();
  lockedApp.use(buildSystemRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011' };
      next();
    },
    parseAiServiceUrl: () => ({ origin: '', hasPath: false }),
    joinUrl: () => '',
    allowDebugFixtures: false,
    IntegrationConnection: createModel(),
    ImportSession: createModel(),
    NotebookFolder: createModel(),
    NotebookEntry: createModel(),
    AgentThread: createModel(),
    AgentStructureProposal: createModel(),
    Article: createModel(),
    WikiPage: createModel(),
    Connection: createModel(),
    Question: createModel()
  }));

  const lockedServer = await new Promise((resolve) => {
    const instance = lockedApp.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const address = lockedServer.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/api/debug/fixtures/import-organization`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' }
    });
    assert.strictEqual(response.status, 404);

    const libraryResponse = await fetch(`${baseUrl}/api/debug/fixtures/library-source-provenance`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' }
    });
    assert.strictEqual(libraryResponse.status, 404);
  } finally {
    await new Promise((resolve, reject) => lockedServer.close((error) => (error ? reject(error) : resolve())));
  }
};

if (require.main === module) {
  run()
    .then(() => {
      console.log('systemRoutes.importOrganizationFixture tests passed');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { run };
