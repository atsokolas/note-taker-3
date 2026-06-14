const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildSharedConceptRouter } = require('../sharedConceptRoutes');

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

  then(resolve, reject) {
    return Promise.resolve(this.value).then(resolve, reject);
  }
}

const matchesValue = (actual, expected) => {
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  return String(actual || '') === String(expected || '');
};

const createModel = () => {
  const rows = [];
  return {
    rows,
    findOne(query = {}) {
      const row = rows.find((item) => Object.entries(query).every(([key, value]) => (
        matchesValue(item[key], value)
      )));
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
      const index = rows.findIndex((item) => Object.entries(query).every(([key, value]) => (
        matchesValue(item[key], value)
      )));
      if (index < 0) return null;
      const [removed] = rows.splice(index, 1);
      return removed;
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

  await User.create({ _id: userId, displayName: 'Owner' });
  await TagMeta.create({
    _id: new mongoose.Types.ObjectId().toString(),
    userId,
    name: 'Opportunity Cost',
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
    tagName: 'Opportunity Cost',
    title: 'Private owner note',
    content: '<p>Do not publish this private note body.</p>'
  });

  const app = express();
  app.use(express.json());
  app.use(buildSharedConceptRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: userId };
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

  try {
    const mint = await fetchJson(`${base}/api/concepts/${encodeURIComponent('Opportunity Cost')}/share`, { method: 'POST' });
    assert.strictEqual(mint.response.status, 201, mint.body.error);
    assert.ok(mint.body.slug);

    const publicRead = await fetchJson(`${base}/api/public/concepts/${mint.body.slug}`);
    assert.strictEqual(publicRead.response.status, 200, publicRead.body.error);
    assert.strictEqual(publicRead.body.concept.name, 'Opportunity Cost');
    assert.strictEqual(publicRead.body.concept.supports[0].title, 'Public argument');
    assert.strictEqual(publicRead.body.concept.supports[0].source, undefined);
    assert.strictEqual(publicRead.body.concept.note, undefined);

    const revoke = await fetchJson(`${base}/api/concepts/${encodeURIComponent('Opportunity Cost')}/share`, { method: 'DELETE' });
    assert.strictEqual(revoke.response.status, 200, revoke.body.error);

    const missing = await fetchJson(`${base}/api/public/concepts/${mint.body.slug}`);
    assert.strictEqual(missing.response.status, 404, missing.body.error);
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
