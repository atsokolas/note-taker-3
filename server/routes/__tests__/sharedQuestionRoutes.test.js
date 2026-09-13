const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildSharedQuestionRouter } = require('../sharedQuestionRoutes');
const { hashPublicQuestion, projectPublicQuestion } = require('../../services/authoredThinkShare');

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
    async findOneAndUpdate(query = {}, update = {}, options = {}) {
      const row = rows.find((item) => matchesQuery(item, query));
      if (!row) return null;
      Object.assign(row, update.$set || update);
      return options.new === false ? null : row;
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
  const question = await Question.create({
    _id: questionId,
    userId,
    text: 'What survives compounding?',
    status: 'open',
    conceptName: 'Compounding',
    blocks: [
      { id: 'p1', type: 'paragraph', text: 'Public paragraph.' },
      { id: 'p2', type: 'paragraph', text: 'Another authored paragraph.' },
      { id: 'h1', type: 'highlight-ref', text: 'secret highlight' },
      {
        id: 'private-excerpt',
        type: 'paragraph',
        text: 'An exact excerpt from the owner Library.',
        articleId: new mongoose.Types.ObjectId().toString(),
        articleTitle: 'Private source',
        sourcePath: '/library?articleId=private#passage=exact'
      }
    ]
  });

  const app = express();
  app.use(express.json());
  app.use(buildSharedQuestionRouter({
    authenticateToken: (req, _res, next) => {
      req.user = { id: userId };
      if (req.headers['x-agent-token']) req.agentToken = true;
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
    const agent = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'POST',
      headers: { 'x-agent-token': '1' }
    });
    assert.strictEqual(agent.response.status, 403);

    const before = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.strictEqual(before.response.status, 200);
    assert.strictEqual(before.body.shared, false);
    assert.ok(before.body.currentHash);

    const staleMint = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'POST',
      body: JSON.stringify({ previewHash: 'nope' })
    });
    assert.strictEqual(staleMint.response.status, 409);

    const mint = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'POST',
      body: JSON.stringify({ previewHash: before.body.currentHash })
    });
    assert.strictEqual(mint.response.status, 201);
    assert.ok(mint.body.slug);
    assert.ok(mint.body.snapshot);
    assert.strictEqual(mint.body.snapshot.question.text, 'What survives compounding?');

    const publicRead = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(publicRead.response.status, 200);
    assert.strictEqual(publicRead.body.question.text, 'What survives compounding?');
    assert.deepStrictEqual(publicRead.body.question.paragraphs, [
      { id: 'p1', type: 'paragraph', text: 'Public paragraph.' },
      { id: 'p2', type: 'paragraph', text: 'Another authored paragraph.' }
    ]);
    assert.ok(!JSON.stringify(publicRead.body).includes('exact excerpt'));
    assert.ok(!JSON.stringify(publicRead.body).includes('secret highlight'));
    assert.strictEqual(
      hashPublicQuestion(projectPublicQuestion(question, 'Owner')),
      mint.body.contentHash
    );

    question.text = 'Rewritten in the workshop.';
    question.blocks.push({ id: 'p3', type: 'paragraph', text: 'A later private paragraph.' });
    const afterEdit = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(afterEdit.body.question.text, 'What survives compounding?');
    assert.ok(!JSON.stringify(afterEdit.body).includes('A later private paragraph.'));

    const status = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.strictEqual(status.body.stale, true);
    assert.strictEqual(status.body.snapshot.question.text, 'What survives compounding?');
    assert.strictEqual(status.body.preview.question.text, 'Rewritten in the workshop.');

    const staleUpdate = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'PUT',
      body: JSON.stringify({ previewHash: mint.body.currentHash })
    });
    assert.strictEqual(staleUpdate.response.status, 409);

    const updated = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'PUT',
      body: JSON.stringify({
        previewHash: status.body.currentHash,
        correction: 'The exception now leads.'
      })
    });
    assert.strictEqual(updated.response.status, 200);
    assert.strictEqual(updated.body.stale, false);
    assert.strictEqual(updated.body.snapshot.question.text, 'Rewritten in the workshop.');
    assert.strictEqual(updated.body.snapshot.correction, 'The exception now leads.');
    assert.strictEqual(updated.body.snapshot.publishedAt, mint.body.snapshot.publishedAt);

    Question.rows.splice(0, Question.rows.length);
    const afterDelete = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(afterDelete.response.status, 200);
    assert.strictEqual(afterDelete.body.question.text, 'Rewritten in the workshop.');

    const revoke = await fetchJson(`${base}/api/questions/${questionId}/share`, { method: 'DELETE' });
    assert.strictEqual(revoke.response.status, 200);
    assert.strictEqual(revoke.body.revoked, true);

    const missing = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(missing.response.status, 404);
    assert.strictEqual(missing.body.error, 'This question is not published.');

    const revokeAgain = await fetchJson(`${base}/api/questions/${questionId}/share`, { method: 'DELETE' });
    assert.strictEqual(revokeAgain.response.status, 404);
    assert.strictEqual(revokeAgain.body.error, 'No active share for this question.');

    const legacy = await SharedQuestion.create({
      userId,
      questionId: new mongoose.Types.ObjectId().toString(),
      slug: 'legacy-q',
      ownerDisplayName: 'Owner'
    });
    await Question.create({
      _id: legacy.questionId,
      userId,
      text: 'A leftover live pointer.',
      status: 'open',
      blocks: [{ id: 'p9', type: 'paragraph', text: 'Backfill this once.' }]
    });
    const backfill = await fetchJson(`${base}/api/public/questions/legacy-q`);
    assert.strictEqual(backfill.response.status, 200, JSON.stringify(backfill.body));
    assert.strictEqual(backfill.body.question.text, 'A leftover live pointer.');
    const liveLegacy = Question.rows.find((row) => String(row._id) === String(legacy.questionId));
    liveLegacy.text = 'Changed after backfill.';
    const frozenLegacy = await fetchJson(`${base}/api/public/questions/legacy-q`);
    assert.strictEqual(frozenLegacy.body.question.text, 'A leftover live pointer.');
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
