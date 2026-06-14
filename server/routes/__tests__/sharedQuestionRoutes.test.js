const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildSharedQuestionRouter } = require('../sharedQuestionRoutes');

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

const createModel = () => {
  const rows = [];
  return {
    rows,
    findOne(query = {}) {
      const row = rows.find((item) => Object.entries(query).every(([key, value]) => (
        String(item[key] || '') === String(value || '')
      )));
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
      const index = rows.findIndex((item) => (
        String(item.userId) === String(query.userId)
        && String(item.questionId) === String(query.questionId)
      ));
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
  const SharedQuestion = createModel();
  const Question = createModel();
  const User = createModel();
  const userId = new mongoose.Types.ObjectId().toString();
  const questionId = new mongoose.Types.ObjectId().toString();

  await User.create({ _id: userId, displayName: 'Owner' });
  await Question.create({
    _id: questionId,
    userId,
    text: 'What survives compounding?',
    status: 'open',
    conceptName: 'Compounding',
    blocks: [
      { id: 'p1', type: 'paragraph', text: 'Public paragraph.' },
      { id: 'h1', type: 'highlight-ref', text: 'secret highlight' }
    ]
  });

  const app = express();
  app.use(express.json());
  app.use(buildSharedQuestionRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: userId };
      next();
    },
    SharedQuestion,
    Question,
    User
  }));

  const server = await listen(app);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const mint = await fetchJson(`${base}/api/questions/${questionId}/share`, { method: 'POST' });
    assert.strictEqual(mint.response.status, 201);
    assert.ok(mint.body.slug);

    const publicRead = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(publicRead.response.status, 200);
    assert.strictEqual(publicRead.body.question.text, 'What survives compounding?');
    assert.deepStrictEqual(publicRead.body.question.paragraphs, [
      { id: 'p1', type: 'paragraph', text: 'Public paragraph.' }
    ]);

    const revoke = await fetchJson(`${base}/api/questions/${questionId}/share`, { method: 'DELETE' });
    assert.strictEqual(revoke.response.status, 200);

    const missing = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(missing.response.status, 404);
  } finally {
    server.close();
  }
};

run()
  .then(() => {
    console.log('sharedQuestionRoutes.test.js passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
