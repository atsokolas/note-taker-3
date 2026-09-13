const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildSharedConceptRouter } = require('../sharedConceptRoutes');

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const matchesValue = (actual, expected) => {
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (Object.prototype.hasOwnProperty.call(expected, '$exists')) {
      const exists = actual !== undefined && actual !== null;
      return expected.$exists ? exists : !exists;
    }
    if (Object.prototype.hasOwnProperty.call(expected, '$in')) {
      return expected.$in.some((value) => value === actual || (value == null && (actual == null || actual === '')));
    }
  }
  return String(actual || '') === String(expected || '');
};

const matchesQuery = (row, query = {}) => Object.entries(query).every(([key, expected]) => {
  if (key === '$or') return expected.some((clause) => matchesQuery(row, clause));
  return matchesValue(row[key], expected);
});

class Query {
  constructor(value) {
    this.value = value;
  }

  select() {
    return this;
  }

  lean() {
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.value).then(resolve, reject);
  }
}

const createModel = () => {
  const rows = [];
  return {
    rows,
    findOne(query = {}) {
      const row = rows.find((item) => matchesQuery(item, query));
      return new Query(row || null);
    },
    findById(id) {
      const row = rows.find((item) => String(item._id || '') === String(id || ''));
      return new Query(row || null);
    },
    async create(payload = {}) {
      const row = {
        _id: new mongoose.Types.ObjectId().toString(),
        createdAt: new Date(),
        ...payload
      };
      rows.push(row);
      return row;
    },
    async findOneAndDelete(query = {}) {
      const index = rows.findIndex((item) => matchesQuery(item, query));
      if (index < 0) return null;
      const [removed] = rows.splice(index, 1);
      return removed;
    },
    async findOneAndUpdate(query = {}, update = {}) {
      const row = rows.find((item) => matchesQuery(item, query));
      if (!row) return null;
      Object.assign(row, update.$set || update);
      return row;
    }
  };
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  return { response, body };
};

const run = async () => {
  const SharedConcept = createModel();
  const TagMeta = createModel();
  const ConceptNote = createModel();
  const User = createModel();
  const userId = new mongoose.Types.ObjectId().toString();
  const conceptName = 'Opportunity Cost';

  await User.create({ _id: userId, displayName: 'Owner' });
  const concept = await TagMeta.create({
    _id: new mongoose.Types.ObjectId().toString(),
    userId,
    name: conceptName,
    description: 'Tradeoffs over hidden alternatives.',
    ideaWorkbench: {
      hypothesis: { html: '<p>Tradeoffs compound.</p>' },
      header: { prompt: 'What does this explain?' },
      cards: [{
        id: 'card-1',
        zone: 'supports',
        type: 'highlight',
        title: 'Public argument',
        content: 'Choosing one path excludes another.',
        source: 'Private article title',
        whyItMatters: 'It makes hidden alternatives visible.'
      }]
    }
  });
  await ConceptNote.create({
    userId,
    tagName: conceptName,
    title: 'Private owner note',
    content: '<p>Do not publish this private note body.</p>'
  });

  const app = express();
  app.use(express.json());
  app.use(buildSharedConceptRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: userId };
      if (req.headers['x-agent-token']) req.agentToken = true;
      next();
    },
    SharedConcept,
    TagMeta,
    ConceptNote,
    User,
    escapeRegExp: (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    getConceptRelated: async () => ({})
  }));

  const server = await listen(app);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const shareUrl = `${base}/api/concepts/${encodeURIComponent(conceptName)}/share`;

  try {
    const agent = await fetchJson(shareUrl, {
      method: 'POST',
      headers: { 'x-agent-token': '1' }
    });
    assert.strictEqual(agent.response.status, 403);

    const before = await fetchJson(shareUrl);
    assert.strictEqual(before.body.shared, false);

    const mint = await fetchJson(shareUrl, {
      method: 'POST',
      body: JSON.stringify({ previewHash: before.body.currentHash })
    });
    assert.strictEqual(mint.response.status, 201, mint.body.error);
    assert.ok(mint.body.slug);

    const publicRead = await fetchJson(`${base}/api/public/concepts/${mint.body.slug}`);
    assert.strictEqual(publicRead.response.status, 200, publicRead.body.error);
    assert.strictEqual(publicRead.body.concept.name, conceptName);
    assert.strictEqual(publicRead.body.concept.supports[0].title, 'Public argument');
    assert.strictEqual(publicRead.body.concept.supports[0].source, undefined);
    assert.strictEqual(publicRead.body.concept.note, undefined);
    assert.ok(!JSON.stringify(publicRead.body).includes('Private article title'));
    assert.ok(!JSON.stringify(publicRead.body).includes('Do not publish'));

    concept.ideaWorkbench.hypothesis.html = '<p>Rewritten in the workshop.</p>';
    const afterEdit = await fetchJson(`${base}/api/public/concepts/${mint.body.slug}`);
    assert.ok(JSON.stringify(afterEdit.body).includes('Tradeoffs compound.'));
    assert.ok(!JSON.stringify(afterEdit.body).includes('Rewritten in the workshop.'));

    const status = await fetchJson(shareUrl);
    assert.strictEqual(status.body.stale, true);

    const staleUpdate = await fetchJson(shareUrl, {
      method: 'PUT',
      body: JSON.stringify({ previewHash: mint.body.currentHash })
    });
    assert.strictEqual(staleUpdate.response.status, 409);

    const updated = await fetchJson(shareUrl, {
      method: 'PUT',
      body: JSON.stringify({ previewHash: status.body.currentHash })
    });
    assert.strictEqual(updated.response.status, 200, JSON.stringify(updated.body));
    assert.ok(JSON.stringify(updated.body.snapshot).includes('Rewritten in the workshop.'));

    TagMeta.rows.splice(0, TagMeta.rows.length);
    const afterDelete = await fetchJson(`${base}/api/public/concepts/${mint.body.slug}`);
    assert.strictEqual(afterDelete.response.status, 200);
    assert.ok(JSON.stringify(afterDelete.body).includes('Rewritten in the workshop.'));
    await TagMeta.create(concept);

    const revoke = await fetchJson(shareUrl, { method: 'DELETE' });
    assert.strictEqual(revoke.response.status, 200, revoke.body.error);

    const missing = await fetchJson(`${base}/api/public/concepts/${mint.body.slug}`);
    assert.strictEqual(missing.response.status, 404, missing.body.error);
    assert.strictEqual(missing.body.error, 'This concept is not published.');
  } finally {
    server.close();
  }
};

run()
  .then(() => {
    console.log('sharedConceptRoutes.test.js passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
