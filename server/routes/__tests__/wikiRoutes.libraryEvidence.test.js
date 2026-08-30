const assert = require('assert');
const express = require('express');
const { buildWikiRouter } = require('../wikiRoutes');
const { encodeVector, contentHashOf } = require('../../ai/vectorStore');

/* Library evidence under a claim that is not a company. The search is the
   held sentence; a saved passage that answers it comes back with its
   highlight id, and nothing is written until the reader files Why. */

const pageReads = [];

class Query {
  constructor(value) { this.value = value; }
  select(projection) { this.projection = projection; return this; }
  maxTimeMS(timeout) { this.timeout = timeout; return this; }
  sort() { return this; }
  limit() { return this; }
  lean() {
    if (this.projection) pageReads.push({ projection: this.projection, timeout: this.timeout });
    return Promise.resolve(this.value ? JSON.parse(JSON.stringify(this.value)) : null);
  }
}

const HIRE_PAGE_ID = '6a5d1c842da7aa36147472ff';
const NOTE_ID = '6a5d1c842da7aa3614747301';
const HIGHLIGHT_ID = '6a5d1c842da7aa3614747302';
const HOLD = 'Hire Maya as the first engineer.';
const PASSAGE = 'Maya is the engineer I would hire first.';
const OWNER_ID = '6873e7773cc513750ec17055';
let vectorSearches = 0;

const hirePage = {
  _id: HIRE_PAGE_ID,
  userId: OWNER_ID,
  title: HOLD,
  judgment: { currentJudgment: HOLD, why: [], against: [] }
};

const emptyPage = {
  _id: '6a49ad6f22f7ad6bbbdf2154',
  userId: OWNER_ID,
  title: 'Untitled',
  judgment: { currentJudgment: '', why: [], against: [] }
};

const hiringNote = {
  _id: NOTE_ID,
  userId: OWNER_ID,
  title: 'Hiring notes',
  siteName: '',
  url: 'https://notes.example/maya',
  content: '<p>Unrelated logistics.</p>',
  archived: false,
  createdAt: '2026-08-20T00:00:00.000Z',
  highlights: [
    { _id: HIGHLIGHT_ID, text: PASSAGE, createdAt: '2026-08-21T00:00:00.000Z' }
  ]
};

const serve = async () => {
  const app = express();
  app.use(buildWikiRouter({
    authenticateToken: (req, _res, next) => { req.user = { id: OWNER_ID }; next(); },
    WikiPage: {
      findOne: (query) => new Query(
        [hirePage, emptyPage].find(page => (
          String(page._id) === String(query._id) && String(page.userId) === String(query.userId)
        )) || null
      )
    },
    Article: {
      find: () => {
        const query = {
          sort: () => query,
          limit: () => query,
          maxTimeMS: () => query,
          lean: async () => [hiringNote]
        };
        return query;
      }
    },
    VectorItem: {
      findOne: () => ({ select: () => ({ lean: async () => ({
        embedding: encodeVector([0.2, 0.4]),
        contentHash: contentHashOf(HOLD)
      }) }) }),
      aggregate: async (pipeline) => {
        vectorSearches += 1;
        assert.strictEqual(String(pipeline[0].$vectorSearch.filter.userId.$eq), OWNER_ID);
        const types = pipeline[0].$vectorSearch.filter.objectType;
        assert.deepStrictEqual(
          types,
          { $in: ['highlight', 'article'] },
          'one semantic read covers only exact highlights and bounded article excerpts'
        );
        return [{
          objectType: 'highlight',
          objectId: HIGHLIGHT_ID,
          metadata: { articleId: NOTE_ID },
          score: 0.9
        }];
      }
    }
  }));
  const server = await new Promise((resolve) => {
    const next = app.listen(0, '127.0.0.1', () => resolve(next));
  });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
};

const run = async () => {
  const { server, base } = await serve();
  try {
    const found = await fetch(`${base}/api/wiki/pages/${HIRE_PAGE_ID}/library-evidence`);
    assert.strictEqual(found.status, 200);
    const body = await found.json();
    assert.strictEqual(body.claim, HOLD);
    assert.ok(body.terms.includes('hire'));
    assert.ok(body.terms.includes('maya'));
    assert.strictEqual(body.candidates.length, 1);
    assert.strictEqual(body.candidates[0].kind, 'highlight');
    assert.strictEqual(body.candidates[0].text, PASSAGE);
    assert.strictEqual(body.candidates[0].highlightId, HIGHLIGHT_ID);
    assert.strictEqual(body.candidates[0].articleId, NOTE_ID);
    assert.strictEqual(body.candidates[0].id, `highlight:${NOTE_ID}:${HIGHLIGHT_ID}`);
    assert.match(body.candidates[0].whyThisSource, /^Answers 4 of 4 key terms/);
    assert.strictEqual(body.candidates[0].side, undefined, 'the route never guesses Why or Against');
    assert.strictEqual(vectorSearches, 1, 'the route reuses one stored held-sentence vector across both exact evidence paths');
    assert.deepStrictEqual(pageReads[0], {
      projection: {
        'judgment.currentJudgment': 1,
        'judgment.why': 1,
        'judgment.against': 1
      },
      timeout: 2000
    }, 'the evidence route reads only the claim and already-filed passages, under a deadline');

    const noClaim = await fetch(`${base}/api/wiki/pages/${emptyPage._id}/library-evidence`);
    assert.strictEqual(noClaim.status, 409);
    assert.match((await noClaim.json()).error, /no claim on this page/i);

    console.log('ok - library evidence for a non-company hold');
  } finally {
    server.close();
  }
};

run().catch((error) => { console.error(error); process.exit(1); });
