#!/usr/bin/env node
const assert = require('assert');

const { buildImportSessionRouter } = require('../server/routes/importSessionRoutes');

const clone = (value) => JSON.parse(JSON.stringify(value));

const matchesQuery = (doc, query = {}) => Object.entries(query).every(([key, expected]) => {
  const actual = doc[key];
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (Array.isArray(expected.$nin)) {
      return !expected.$nin.includes(actual);
    }
  }
  return String(actual) === String(expected);
});

const sortDocs = (docs = [], sortSpec = {}) => {
  const entries = Object.entries(sortSpec);
  if (!entries.length) return docs.slice();
  return docs.slice().sort((left, right) => {
    for (const [key, direction] of entries) {
      const leftValue = left[key] ? new Date(left[key]).getTime() : 0;
      const rightValue = right[key] ? new Date(right[key]).getTime() : 0;
      if (leftValue === rightValue) continue;
      return direction < 0 ? rightValue - leftValue : leftValue - rightValue;
    }
    return 0;
  });
};

const createImportSessionModel = () => {
  const sessions = [];
  let nextId = 1;

  const makeDoc = (input) => {
    const stored = {
      _id: input._id || `session-${nextId++}`,
      provider: input.provider || '',
      mode: input.mode || 'manual',
      status: input.status || 'draft',
      sourceLabel: input.sourceLabel || '',
      connectionId: input.connectionId || null,
      config: clone(input.config || {}),
      preview: clone(input.preview || {}),
      progress: clone(input.progress || {}),
      result: clone(input.result || {}),
      activation: clone(input.activation || {}),
      lastError: input.lastError || '',
      userId: input.userId,
      createdAt: input.createdAt ? new Date(input.createdAt) : new Date(),
      updatedAt: input.updatedAt ? new Date(input.updatedAt) : new Date()
    };
    stored.toObject = () => clone(stored);
    stored.save = async () => {
      stored.updatedAt = new Date();
      return stored;
    };
    return stored;
  };

  const findMany = (query = {}) => {
    let results = sessions.filter((doc) => matchesQuery(doc, query));
    return {
      sort(sortSpec = {}) {
        results = sortDocs(results, sortSpec);
        return this;
      },
      limit(count = results.length) {
        results = results.slice(0, count);
        return this;
      },
      lean: async () => results.map((doc) => clone(doc))
    };
  };

  const findOne = (query = {}) => {
    const matched = sessions.filter((doc) => matchesQuery(doc, query));
    const first = matched[0] || null;
    return {
      sort(sortSpec = {}) {
        const sorted = sortDocs(matched, sortSpec);
        return {
          lean: async () => (sorted[0] ? clone(sorted[0]) : null)
        };
      },
      lean: async () => (first ? clone(first) : null),
      then(resolve, reject) {
        return Promise.resolve(first).then(resolve, reject);
      },
      catch(reject) {
        return Promise.resolve(first).catch(reject);
      }
    };
  };

  const findOneAndDelete = (query = {}) => {
    const index = sessions.findIndex((doc) => matchesQuery(doc, query));
    const deleted = index >= 0 ? sessions.splice(index, 1)[0] : null;
    return {
      lean: async () => (deleted ? clone(deleted) : null)
    };
  };

  return {
    create: async (payload = {}) => {
      const doc = makeDoc(payload);
      sessions.push(doc);
      return doc;
    },
    find: findMany,
    findOne,
    findOneAndDelete,
    _sessions: sessions
  };
};

const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
};

const invokeRoute = async (router, { method, path, params = {}, query = {}, body = {}, user = { id: 'user-1' } }) => {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === path && entry.route.methods[method]);
  assert.ok(layer, `route not found: ${method.toUpperCase()} ${path}`);
  const req = { method: method.toUpperCase(), params, query, body, user };
  const res = makeRes();
  for (const stackLayer of layer.route.stack) {
    await new Promise((resolve, reject) => {
      try {
        const maybePromise = stackLayer.handle(req, res, (error) => (error ? reject(error) : resolve()));
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(resolve).catch(reject);
        } else if (stackLayer.handle.length < 3) {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  }
  return res;
};

const run = async () => {
  const ImportSession = createImportSessionModel();
  const router = buildImportSessionRouter({
    authenticateToken: (_req, _res, next) => next(),
    ImportSession
  });

  const createRes = await invokeRoute(router, {
    method: 'post',
    path: '/api/import/sessions',
    body: {
      provider: 'readwise',
      mode: 'api_token',
      status: 'draft',
      sourceLabel: 'Reader',
      config: {
        sourceType: 'api',
        importStrategy: 'api_token',
        selectedIds: ['a', 'b']
      },
      progress: {
        stage: 'draft',
        percent: 0,
        indexingState: 'not_started'
      },
      activation: {
        primaryAction: 'create_concept'
      }
    }
  });
  assert.strictEqual(createRes.statusCode, 201, 'expected create route to succeed');
  const sessionId = createRes.body?.session?.id;
  assert.ok(sessionId, 'expected created session id');
  assert.strictEqual(createRes.body.session.provider, 'readwise');
  assert.strictEqual(createRes.body.session.config.sourceType, 'api');

  const activeRes = await invokeRoute(router, {
    method: 'get',
    path: '/api/import/sessions/active'
  });
  assert.strictEqual(activeRes.statusCode, 200);
  assert.strictEqual(activeRes.body?.session?.id, sessionId, 'expected active route to return draft session');

  const patchRes = await invokeRoute(router, {
    method: 'patch',
    path: '/api/import/sessions/:id',
    params: { id: sessionId },
    body: {
      status: 'completed_with_warnings',
      preview: {
        items: 5,
        sampleTitles: ['Deep Work', 'Deep Work', 'Systems Thinking'],
        warningCodes: ['preview_sampled', 'preview_sampled'],
        warnings: ['Preview is sampled.']
      },
      result: {
        importedArticles: 2,
        importedHighlights: 5,
        duplicateSkips: 1,
        warningCodes: ['indexing_failed'],
        warnings: ['Highlight indexing failed for one item.'],
        lastImportedArticleId: 'article-1'
      },
      activation: {
        status: 'captured',
        conceptId: 'concept-1',
        conceptName: 'Attention systems'
      }
    }
  });
  assert.strictEqual(patchRes.statusCode, 200, 'expected patch route to succeed');
  assert.deepStrictEqual(
    patchRes.body.session.preview.sampleTitles,
    ['Deep Work', 'Systems Thinking'],
    'expected preview titles to be sanitized and deduped'
  );
  assert.deepStrictEqual(
    patchRes.body.session.preview.warningCodes,
    ['preview_sampled'],
    'expected preview warning codes to be sanitized and deduped'
  );
  assert.strictEqual(patchRes.body.session.result.importedArticles, 2);
  assert.strictEqual(patchRes.body.session.activation.conceptId, 'concept-1');

  const getRes = await invokeRoute(router, {
    method: 'get',
    path: '/api/import/sessions/:id',
    params: { id: sessionId }
  });
  assert.strictEqual(getRes.statusCode, 200);
  assert.strictEqual(getRes.body.session.result.lastImportedArticleId, 'article-1');

  const deleteRes = await invokeRoute(router, {
    method: 'delete',
    path: '/api/import/sessions/:id',
    params: { id: sessionId }
  });
  assert.strictEqual(deleteRes.statusCode, 200, 'expected delete route to succeed');
  assert.strictEqual(deleteRes.body.session.id, sessionId);

  const missingDeleteRes = await invokeRoute(router, {
    method: 'delete',
    path: '/api/import/sessions/:id',
    params: { id: sessionId }
  });
  assert.strictEqual(missingDeleteRes.statusCode, 404, 'expected second delete to return 404');

  console.log('import session route tests passed');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
