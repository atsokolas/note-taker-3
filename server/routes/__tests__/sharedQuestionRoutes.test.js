const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildSharedQuestionRouter } = require('../sharedQuestionRoutes');
const {
  CONTRIBUTION_LIMIT,
  hashPublicQuestion,
  projectPublicQuestion
} = require('../../services/authoredThinkShare');

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
      if (update?.$inc && Object.prototype.hasOwnProperty.call(update.$inc, 'contributionCount')) {
        const slug = String(query.slug || '').trim();
        const row = rows.find((item) => item.slug === slug && item.snapshot);
        if (!row) return null;
        const delta = Number(update.$inc.contributionCount) || 0;
        const count = Number(row.contributionCount || 0);
        if (delta > 0 && count >= CONTRIBUTION_LIMIT) return null;
        if (delta < 0 && count <= 0) return null;
        row.contributionCount = Math.max(0, count + delta);
        return options.new === false ? null : row;
      }
      const row = rows.find((item) => matchesQuery(item, query));
      if (!row) return null;
      Object.assign(row, update.$set || update);
      return options.new === false ? null : row;
    },
    find(query = {}) {
      const found = rows.filter((item) => matchesQuery(item, query));
      return {
        sort() {
          return {
            lean: async () => found
          };
        },
        lean: async () => found
      };
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
  const QuestionContribution = createModel();
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
    QuestionContribution,
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
    assert.deepStrictEqual(publicRead.body.contributions, []);
    assert.deepStrictEqual(mint.body.contributions, []);
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

    const offer = (targetSlug, body) => fetchJson(`${base}/api/public/questions/${targetSlug}/contributions`, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const nameless = await offer(mint.body.slug, { text: 'Patience is not avoidance.' });
    assert.strictEqual(nameless.response.status, 400);

    const empty = await offer(mint.body.slug, { by: 'Mara', text: '   ' });
    assert.strictEqual(empty.response.status, 400);

    const reading = await offer(mint.body.slug, {
      by: ' <em>Mara</em> ',
      text: '<p>Same fact, different time horizon.</p>',
      remainder: 'Who pays when the window closes?',
      articleId: 'secret',
      sourcePath: '/library?articleId=secret'
    });
    assert.strictEqual(reading.response.status, 201, JSON.stringify(reading.body));
    assert.deepStrictEqual(reading.body, { sent: true });

    const together = await fetchJson(`${base}/api/public/questions/${mint.body.slug}`);
    assert.strictEqual(together.body.question.text, 'What survives compounding?');
    assert.strictEqual(together.body.contributions.length, 1);
    assert.strictEqual(together.body.contributions[0].by, 'Mara');
    assert.strictEqual(together.body.contributions[0].text, 'Same fact, different time horizon.');
    assert.strictEqual(together.body.contributions[0].remainder, 'Who pays when the window closes?');
    assert.ok(!JSON.stringify(together.body.contributions).includes('secret'));
    assert.ok(!JSON.stringify(together.body.contributions).includes('library?'));
    assert.ok(!together.body.snapshot);

    const ownerSees = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.strictEqual(ownerSees.body.contributions[0].text, 'Same fact, different time horizon.');
    assert.ok(!ownerSees.body.snapshot.contributions);

    const filled = [];
    for (let i = 1; i < CONTRIBUTION_LIMIT; i += 1) {
      filled.push(offer(mint.body.slug, { by: 'Mara', text: `Reading ${i + 1}.` }));
    }
    const filledResults = await Promise.all(filled);
    assert.ok(filledResults.every((item) => item.response.status === 201));

    const overflow = await offer(mint.body.slug, { by: 'Mara', text: 'One more.' });
    assert.strictEqual(overflow.response.status, 409);
    assert.strictEqual(SharedQuestion.rows[0].contributionCount, CONTRIBUTION_LIMIT);

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

    const goneDoor = await offer(mint.body.slug, { by: 'Mara', text: 'After revoke.' });
    assert.strictEqual(goneDoor.response.status, 404);

    await Question.create({
      _id: questionId,
      userId,
      text: 'What survives compounding?',
      status: 'open',
      conceptName: 'Compounding',
      blocks: [{ id: 'p1', type: 'paragraph', text: 'Public paragraph.' }]
    });
    const reopen = await fetchJson(`${base}/api/questions/${questionId}/share`);
    assert.strictEqual(reopen.body.shared, false);
    const remint = await fetchJson(`${base}/api/questions/${questionId}/share`, {
      method: 'POST',
      body: JSON.stringify({ previewHash: reopen.body.currentHash })
    });
    assert.strictEqual(remint.response.status, 201);
    assert.notStrictEqual(remint.body.slug, mint.body.slug);
    assert.deepStrictEqual(remint.body.contributions, []);
    const nextDoor = await offer(remint.body.slug, { by: 'Mara', text: 'A later door.' });
    assert.strictEqual(nextDoor.response.status, 201);
    const newPage = await fetchJson(`${base}/api/public/questions/${remint.body.slug}`);
    assert.strictEqual(newPage.body.contributions.length, 1);
    assert.strictEqual(newPage.body.contributions[0].text, 'A later door.');

    const closeLater = await fetchJson(`${base}/api/questions/${questionId}/share`, { method: 'DELETE' });
    assert.strictEqual(closeLater.response.status, 200);
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
