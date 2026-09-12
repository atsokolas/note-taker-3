const express = require('express');
const http = require('http');
const { buildHighlightMutationRouter } = require('../highlightMutationRoutes');

/* A highlight lives inside its article as a subdocument, so it has no articleId
   field of its own. The create route used to return that raw subdocument, and a
   caller reading articleId off it saw nothing — one agent read its own five
   successful writes as five unattached highlights and reported them as lost. */
describe('created highlight carries its article', () => {
  const createHighlight = async (body) => {
    const article = {
      _id: 'article-1',
      title: 'Going Founder Mode on Cancer',
      url: 'https://centuryofbio.com/p/sid',
      highlights: []
    };

    const app = express();
    app.use(express.json());
    app.use(buildHighlightMutationRouter({
      mongoose: { Types: { ObjectId: String } },
      authenticateToken: (req, _res, next) => {
        req.user = { id: 'user-1' };
        next();
      },
      Article: {
        findOneAndUpdate: async (_query, update) => {
          article.highlights.push({ _id: 'highlight-1', ...update.$push.highlights });
          return article;
        }
      },
      normalizeTags: value => (Array.isArray(value) ? value : []),
      enqueueHighlightEmbedding: () => {},
      safeMapEmbedding: () => null,
      highlightToEmbeddingItem: () => null,
      queueEmbeddingUpsert: () => {},
      markTourSignal: async () => {},
      normalizeItemType: (value, fallback) => value || fallback,
      parseClaimId: value => value || null,
      buildEmbeddingId: () => '',
      queueEmbeddingDelete: () => {}
    }));
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/articles/article-1/highlights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: response.status, body: await response.json() };
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  };

  test('the created highlight names the article it was pushed into', async () => {
    const result = await createHighlight({ text: 'Founder mode is a claim about proximity.' });
    expect(result.status).toBe(200);
    expect(result.body.highlight.articleId).toBe('article-1');
    expect(result.body.highlight.articleTitle).toBe('Going Founder Mode on Cancer');
    expect(result.body.highlight._id).toBe('highlight-1');
    expect(result.body.highlight.text).toBe('Founder mode is a claim about proximity.');
  });

  /* The update path answers from the document it just saved rather than reading
     the same row back. What it answers with still has to be the change. */
  test('an update answers with the saved highlight and its article', async () => {
    const highlight = { _id: 'highlight-1', text: 'Founder mode.', note: '', tags: [], color: '#f6e27a', type: 'note', claimId: null };
    const article = {
      _id: 'article-1',
      title: 'Going Founder Mode on Cancer',
      url: 'https://centuryofbio.com/p/sid',
      highlights: Object.assign([highlight], { id: (id) => (String(id) === 'highlight-1' ? highlight : null) }),
      save: async () => article
    };

    const app = express();
    app.use(express.json());
    app.use(buildHighlightMutationRouter({
      mongoose: { Types: { ObjectId: String } },
      authenticateToken: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
      Article: { findOne: async () => article },
      normalizeTags: value => (Array.isArray(value) ? value : []),
      enqueueHighlightEmbedding: () => {},
      safeMapEmbedding: () => null,
      highlightToEmbeddingItem: () => null,
      queueEmbeddingUpsert: () => {},
      markTourSignal: async () => {},
      normalizeItemType: (value, fallback) => value || fallback,
      parseClaimId: value => value || null,
      buildEmbeddingId: () => '',
      queueEmbeddingDelete: () => {}
    }));
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/articles/article-1/highlights/highlight-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Proximity is the claim.', tags: ['bio'] })
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.articleId).toBe('article-1');
      expect(body.articleTitle).toBe('Going Founder Mode on Cancer');
      expect(body.note).toBe('Proximity is the claim.');
      expect(body.tags).toEqual(['bio']);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('an anchor survives the round trip', async () => {
    const result = await createHighlight({
      text: 'Founder mode is a claim about proximity.',
      anchor: { text: 'Founder mode is a claim about proximity.', prefix: 'So ', suffix: ' Then' }
    });
    expect(result.body.highlight.anchor.prefix).toBe('So ');
  });

  test('a text correction records a processed source event with the old quotation', async () => {
    const OLD = 'Two hours a week can sustain this.';
    const NEW = 'Two hours a week cannot sustain this.';
    const highlight = {
      _id: '64f2000000000000000000aa',
      text: OLD,
      note: '',
      tags: [],
      color: '#f6e27a',
      type: 'note',
      claimId: null
    };
    const article = {
      _id: '64f2000000000000000000bb',
      title: 'A letter on time',
      url: 'https://example.com/letter',
      highlights: Object.assign([highlight], {
        id: (id) => (String(id) === String(highlight._id) ? highlight : null)
      }),
      save: async () => article
    };
    const store = [];
    function WikiSourceEvent(value) {
      Object.assign(this, value);
      this._id = this._id || `evt-${store.length + 1}`;
      this.save = async () => {
        const index = store.findIndex((row) => String(row._id) === String(this._id));
        if (index >= 0) store[index] = this;
        else store.push(this);
        return this;
      };
    }
    WikiSourceEvent.findOne = () => {
      const api = {
        sort() { return api; },
        lean: async () => store[0] || null
      };
      api.then = (resolve, reject) => Promise.resolve(store[0] || null).then(resolve, reject);
      return api;
    };

    const app = express();
    app.use(express.json());
    app.use(buildHighlightMutationRouter({
      mongoose: { Types: { ObjectId: String } },
      authenticateToken: (req, _res, next) => { req.user = { id: '64f200000000000000000001' }; next(); },
      Article: { findOne: async () => article },
      normalizeTags: (value) => (Array.isArray(value) ? value : []),
      enqueueHighlightEmbedding: () => {},
      safeMapEmbedding: () => null,
      highlightToEmbeddingItem: () => null,
      queueEmbeddingUpsert: () => {},
      markTourSignal: async () => {},
      normalizeItemType: (value, fallback) => value || fallback,
      parseClaimId: (value) => value || null,
      buildEmbeddingId: () => '',
      queueEmbeddingDelete: () => {},
      WikiSourceEvent
    }));
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/articles/${article._id}/highlights/${highlight._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: NEW })
      });
      expect(response.status).toBe(200);
      expect(store).toHaveLength(1);
      expect(store[0].metadata.kind).toBe('source_correction');
      expect(store[0].metadata.previousText).toBe(OLD);
      expect(store[0].text).toBe(NEW);
      expect(store[0].status).toBe('processed');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
