const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');

const { buildMuseConnectorRouter } = require('../museConnectorRoutes');
const {
  buildAuthenticateAgentToken,
  hashAgentTokenSecret,
  AGENT_TOKEN_PREFIX
} = require('../../services/agentTokenService');

const USER_ID = '64f000000000000000000001';
const NOTE_ID = '64f000000000000000000011';
const ARTICLE_ID = '64f000000000000000000021';
const CONCEPT_ID = '64f000000000000000000031';
const JUDGMENT_ID = '64f000000000000000000041';
const OTHER_NOTE_ID = '64f000000000000000000012';

const READ_SECRET = `${AGENT_TOKEN_PREFIX}readsecret000000000000000001`;
const WRITE_SECRET = `${AGENT_TOKEN_PREFIX}writesecret00000000000000001`;
const REVOKED_SECRET = `${AGENT_TOKEN_PREFIX}revokedsecret000000000000001`;

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const collectPath = (record, parts) => {
  if (record == null || parts.length === 0) return [record];
  const [head, ...rest] = parts;
  const value = record[head];
  if (Array.isArray(value)) {
    return value.flatMap((item) => (
      rest.length === 0
        ? [item]
        : (item && typeof item === 'object' ? collectPath(item, rest) : [item])
    ));
  }
  if (rest.length === 0) return [value];
  if (value && typeof value === 'object') return collectPath(value, rest);
  return [undefined];
};

const matches = (record, query = {}) => {
  if (!query || typeof query !== 'object') return true;
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((clause) => matches(record, clause));
    if (key === '$and') return expected.every((clause) => matches(record, clause));
    const values = collectPath(record, key.split('.'));
    if (expected instanceof RegExp) {
      return values.some((value) => expected.test(String(value ?? '')));
    }
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if (expected.$exists !== undefined) {
        const exists = values.some((value) => value !== undefined && value !== null && value !== '');
        return expected.$exists ? exists : !exists;
      }
      if (Array.isArray(expected.$nin)) {
        const banned = expected.$nin.map((item) => String(item ?? ''));
        return values.every((value) => !banned.includes(String(value ?? '')));
      }
      if (expected.$ne !== undefined) {
        return values.every((value) => String(value ?? '') !== String(expected.$ne ?? ''));
      }
    }
    return values.some((value) => String(value ?? '') === String(expected ?? ''));
  });
};

class Query {
  constructor(value) {
    this.value = value;
  }

  select() {
    return this;
  }

  sort(spec = {}) {
    if (Array.isArray(this.value)) {
      this.value = [...this.value].sort((left, right) => {
        for (const [key, rawDirection] of Object.entries(spec)) {
          const direction = Number(rawDirection) < 0 ? -1 : 1;
          const leftRaw = left?.[key];
          const rightRaw = right?.[key];
          const leftTime = /At$/.test(key) ? new Date(leftRaw || 0).getTime() : String(leftRaw || '');
          const rightTime = /At$/.test(key) ? new Date(rightRaw || 0).getTime() : String(rightRaw || '');
          if (leftTime < rightTime) return -1 * direction;
          if (leftTime > rightTime) return 1 * direction;
        }
        return 0;
      });
    }
    return this;
  }

  limit(count) {
    if (Array.isArray(this.value)) this.value = this.value.slice(0, count);
    return this;
  }

  lean() {
    return Promise.resolve(
      Array.isArray(this.value)
        ? this.value.map((row) => ({ ...row }))
        : (this.value ? { ...this.value } : null)
    );
  }

  then(resolve, reject) {
    return this.lean().then(resolve, reject);
  }
}

const createCollection = (rows) => ({
  rows,
  find(query = {}) {
    return new Query(rows.filter((row) => matches(row, query)));
  },
  findOne(query = {}) {
    return new Query(rows.find((row) => matches(row, query)) || null);
  },
  async create(payload = {}) {
    const row = {
      _id: new mongoose.Types.ObjectId().toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...payload
    };
    rows.push(row);
    return row;
  }
});

const attachSave = (row) => {
  row.save = async function save() {
    this.updatedAt = new Date();
    return this;
  };
  return row;
};

const createAgentTokenModel = (rows) => ({
  async findOne(query = {}) {
    const row = rows.find((item) => String(item.hashedSecret) === String(query.hashedSecret));
    return row || null;
  }
});

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, body };
};

const auth = (secret) => ({ Authorization: `Bearer ${secret}` });

const run = async () => {
  const now = new Date('2026-09-19T12:00:00.000Z');
  const tokens = [
    attachSave({
      _id: 'token-read',
      userId: USER_ID,
      label: 'Muse read',
      hashedSecret: hashAgentTokenSecret(READ_SECRET),
      secretPrefix: 'ntk_at_readse...',
      scopes: ['read'],
      dailyQuota: null,
      callsToday: 0,
      quotaWindowStartedAt: now,
      status: 'active'
    }),
    attachSave({
      _id: 'token-write',
      userId: USER_ID,
      label: 'Muse write',
      hashedSecret: hashAgentTokenSecret(WRITE_SECRET),
      secretPrefix: 'ntk_at_writes...',
      scopes: ['read', 'agent-write'],
      dailyQuota: null,
      callsToday: 0,
      quotaWindowStartedAt: now,
      status: 'active'
    }),
    attachSave({
      _id: 'token-revoked',
      userId: USER_ID,
      label: 'Muse revoked',
      hashedSecret: hashAgentTokenSecret(REVOKED_SECRET),
      secretPrefix: 'ntk_at_revoke...',
      scopes: ['read', 'agent-write'],
      status: 'revoked',
      revokedAt: now
    })
  ];

  const notes = [
    {
      _id: NOTE_ID,
      userId: USER_ID,
      title: 'Circle of competence',
      content: 'Stay inside what you can actually judge.',
      blocks: [{ id: 'b1', type: 'paragraph', text: 'Stay inside what you can actually judge.' }],
      tags: ['buffett'],
      updatedAt: new Date('2026-09-18T10:00:00.000Z'),
      createdAt: new Date('2026-09-01T10:00:00.000Z')
    },
    {
      _id: OTHER_NOTE_ID,
      userId: '64f000000000000000000099',
      title: 'Foreign note',
      content: 'Should never leak.',
      updatedAt: new Date('2026-09-18T11:00:00.000Z')
    }
  ];
  const articles = [
    {
      _id: ARTICLE_ID,
      userId: USER_ID,
      title: 'Patient capital',
      url: 'https://example.com/patient-capital',
      siteName: 'Example',
      author: 'A Reader',
      content: 'Patient capital compounds when you wait.',
      debugOnly: false,
      archived: false,
      createdAt: new Date('2026-09-17T09:00:00.000Z'),
      updatedAt: new Date('2026-09-17T09:00:00.000Z')
    },
    {
      _id: '64f000000000000000000022',
      userId: USER_ID,
      title: 'Hidden debug article',
      content: 'debug only',
      debugOnly: true,
      archived: false,
      createdAt: new Date('2026-09-19T09:00:00.000Z')
    }
  ];
  const concepts = [
    {
      _id: CONCEPT_ID,
      userId: USER_ID,
      name: 'Margin of Safety',
      description: 'Leave room to be wrong.',
      pinnedHighlightIds: [],
      pinnedArticleIds: [],
      pinnedNoteIds: [],
      archived: false,
      updatedAt: new Date('2026-09-16T08:00:00.000Z')
    }
  ];
  const pages = [
    {
      _id: JUDGMENT_ID,
      userId: USER_ID,
      title: 'Capacity',
      status: 'published',
      judgment: {
        kind: 'thesis',
        currentJudgment: 'Demand still outruns deliverable capacity.',
        governingQuestion: 'What would change this?',
        why: [{ text: 'Backlog is still lengthening.', sourceLabel: 'Q2 note' }],
        against: [{ text: 'A new fab could close the gap.', sourceLabel: '' }]
      },
      updatedAt: new Date('2026-09-15T08:00:00.000Z')
    },
    {
      _id: '64f000000000000000000042',
      userId: USER_ID,
      title: 'Ordinary wiki page',
      status: 'published',
      judgment: null,
      updatedAt: new Date('2026-09-19T08:00:00.000Z')
    }
  ];
  const users = [
    { _id: USER_ID, username: 'athan' }
  ];

  const capturedEvents = [];
  const authenticateAgentToken = buildAuthenticateAgentToken({
    AgentToken: createAgentTokenModel(tokens),
    now: () => now
  });
  const authenticateToken = (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token.startsWith(AGENT_TOKEN_PREFIX)) {
      return authenticateAgentToken(req, res, next);
    }
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  };

  const app = express();
  app.use(express.json());
  app.use(buildMuseConnectorRouter({
    authenticateToken,
    mongoose,
    User: createCollection(users),
    NotebookEntry: createCollection(notes),
    Article: createCollection(articles),
    TagMeta: createCollection(concepts),
    WikiPage: createCollection(pages),
    trackEvent: (event) => capturedEvents.push(event),
    EVENT_NAMES: { CAPTURE_COMPLETED: 'capture_completed' },
    apiUrl: 'https://note-taker-3-unrg.onrender.com',
    appUrl: 'https://www.noeis.io'
  }));

  const server = await listen(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const spec = await fetchJson(`${base}/api/v1/openapi.json`);
    assert.strictEqual(spec.response.status, 200);
    assert.strictEqual(spec.body.openapi, '3.0.3');
    assert.ok(spec.body.paths['/api/v1/me']);
    assert.ok(spec.body.paths['/api/v1/search']);
    assert.ok(spec.body.paths['/api/v1/captures']);
    assert.strictEqual(spec.body.components.securitySchemes.bearerAuth.scheme, 'bearer');
    assert.ok(!JSON.stringify(spec.body).includes(WRITE_SECRET));

    const docs = await fetchJson(`${base}/api/v1/docs.md`);
    assert.strictEqual(docs.response.status, 200);
    assert.match(String(docs.body), /Paste this into Muse/i);
    assert.match(String(docs.body), /Authorization: Bearer ntk_at_/);

    const missing = await fetchJson(`${base}/api/v1/me`);
    assert.strictEqual(missing.response.status, 401);

    const bogus = await fetchJson(`${base}/api/v1/me`, { headers: auth('ntk_at_notreal') });
    assert.strictEqual(bogus.response.status, 401);

    const revoked = await fetchJson(`${base}/api/v1/me`, { headers: auth(REVOKED_SECRET) });
    assert.strictEqual(revoked.response.status, 401);

    const me = await fetchJson(`${base}/api/v1/me`, { headers: auth(READ_SECRET) });
    assert.strictEqual(me.response.status, 200);
    assert.strictEqual(me.body.format, 'noeis.muse-connector');
    assert.strictEqual(me.body.workspace.id, USER_ID);
    assert.strictEqual(me.body.workspace.username, 'athan');
    assert.deepStrictEqual(me.body.grant.scopes, ['read']);
    assert.strictEqual(me.body.capabilities.agentWrite, false);
    assert.strictEqual(me.body.contentRead, false);
    assert.ok(!JSON.stringify(me.body).includes(READ_SECRET));

    const emptySearch = await fetchJson(`${base}/api/v1/search`, { headers: auth(READ_SECRET) });
    assert.strictEqual(emptySearch.response.status, 400);

    const search = await fetchJson(`${base}/api/v1/search?q=competence`, { headers: auth(READ_SECRET) });
    assert.strictEqual(search.response.status, 200);
    assert.strictEqual(search.body.hits.length, 1);
    assert.strictEqual(search.body.hits[0].type, 'notebook');
    assert.strictEqual(search.body.hits[0].id, NOTE_ID);
    assert.match(search.body.hits[0].href, /tab=notebook/);
    assert.ok(!search.body.hits.some((hit) => hit.title === 'Foreign note'));

    const conceptSearch = await fetchJson(
      `${base}/api/v1/search?q=Margin&types=concept`,
      { headers: auth(READ_SECRET) }
    );
    assert.strictEqual(conceptSearch.body.hits[0].id, CONCEPT_ID);

    const recent = await fetchJson(`${base}/api/v1/recent?types=library,notebook`, { headers: auth(READ_SECRET) });
    assert.strictEqual(recent.response.status, 200);
    assert.ok(recent.body.items.some((item) => item.id === ARTICLE_ID));
    assert.ok(recent.body.items.some((item) => item.id === NOTE_ID));
    assert.ok(!recent.body.items.some((item) => item.title === 'Hidden debug article'));
    assert.ok(!recent.body.items.some((item) => item.title === 'Foreign note'));

    const note = await fetchJson(`${base}/api/v1/notebook/${NOTE_ID}`, { headers: auth(READ_SECRET) });
    assert.strictEqual(note.response.status, 200);
    assert.match(note.body.content, /actually judge/);
    assert.strictEqual(note.body.openUrl, `https://www.noeis.io/think?tab=notebook&entryId=${NOTE_ID}`);

    const article = await fetchJson(`${base}/api/v1/library/${ARTICLE_ID}`, { headers: auth(READ_SECRET) });
    assert.strictEqual(article.response.status, 200);
    assert.strictEqual(article.body.title, 'Patient capital');

    const conceptByName = await fetchJson(
      `${base}/api/v1/concepts/${encodeURIComponent('Margin of Safety')}`,
      { headers: auth(READ_SECRET) }
    );
    assert.strictEqual(conceptByName.response.status, 200);
    assert.strictEqual(conceptByName.body.id, CONCEPT_ID);

    const judgment = await fetchJson(`${base}/api/v1/judgments/${JUDGMENT_ID}`, { headers: auth(READ_SECRET) });
    assert.strictEqual(judgment.response.status, 200);
    assert.match(judgment.body.currentJudgment, /Demand still outruns/);
    assert.strictEqual(judgment.body.why[0].text, 'Backlog is still lengthening.');
    assert.strictEqual(judgment.body.href, `/judgment/${JUDGMENT_ID}`);

    const ordinaryWiki = await fetchJson(
      `${base}/api/v1/judgments/64f000000000000000000042`,
      { headers: auth(READ_SECRET) }
    );
    assert.strictEqual(ordinaryWiki.response.status, 404);

    const denied = await fetchJson(`${base}/api/v1/captures`, {
      method: 'POST',
      headers: { ...auth(READ_SECRET), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'should not write' })
    });
    assert.strictEqual(denied.response.status, 403);
    assert.strictEqual(notes.length, 2);

    const capture = await fetchJson(`${base}/api/v1/captures`, {
      method: 'POST',
      headers: { ...auth(WRITE_SECRET), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Demand still outruns supply', tags: ['muse'] })
    });
    assert.strictEqual(capture.response.status, 201);
    assert.strictEqual(capture.body.type, 'notebook');
    assert.match(capture.body.content, /Demand still outruns supply/);
    assert.ok(capture.body.id);
    assert.ok(!JSON.stringify(capture.body).includes(WRITE_SECRET));
    assert.strictEqual(notes.length, 3);
    assert.strictEqual(capturedEvents[0].event, 'capture_completed');
    assert.strictEqual(capturedEvents[0].properties.source, 'muse');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

run().then(() => {
  console.log('museConnectorRoutes tests passed');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
