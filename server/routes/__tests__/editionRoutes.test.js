const express = require('express');
const { buildEditionRouter } = require('../editionRoutes');

/**
 * The paper an agent maintains, and the one door that runs the other way.
 */

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const item = (over = {}) => ({
  title: 'A paper about scaling',
  url: 'https://example.com/paper',
  section: 'models_methods',
  finding: 'Loss keeps falling past the expected compute budget.',
  boundary: 'One lab, one architecture, no replication yet.',
  ...over
});

const week = (over = {}) => ({
  profile: 'this_week_in_ai',
  windowStart: '2026-09-01',
  windowEnd: '2026-09-07',
  items: [item(), item({ title: 'A second', url: 'https://example.com/two' })],
  ...over
});

/* A store small enough to reason about: the router's contract is what it does
   with an edition, not which driver holds it. */
const makeStore = () => {
  const rows = [];
  let nextId = 1;
  const clone = value => JSON.parse(JSON.stringify(value));
  const matches = (row, query) => Object.entries(query).every(([key, value]) => {
    if (value instanceof Date) return new Date(row[key]).getTime() === value.getTime();
    return String(row[key]) === String(value);
  });
  const attach = row => Object.assign(row, { save: async () => { row.updatedAt = 'now'; } });
  return {
    rows,
    /* Awaitable, and .lean()-able, because the read paths ask for plain rows
       and the write paths ask for a document they can save. */
    findOne: (query) => {
      const row = () => rows.find(entry => matches(entry, query)) || null;
      return {
        then: (resolve, reject) => Promise.resolve(row() && attach(row())).then(resolve, reject),
        lean: async () => (row() ? clone(row()) : null)
      };
    },
    find: (query) => {
      const found = rows.filter(row => matches(row, query));
      const chain = { sort: () => chain, limit: () => chain, lean: async () => clone(found) };
      return chain;
    },
    create: async (doc) => {
      const row = attach({ ...doc, _id: `edition-${nextId++}`, createdAt: 'then', updatedAt: 'then' });
      rows.push(row);
      return row;
    },
    findOneAndUpdate: async (query, patch) => {
      const row = rows.find(entry => matches(entry, query));
      if (!row) return null;
      Object.assign(row, patch);
      return attach(row);
    },
    findOneAndDelete: async (query) => {
      const index = rows.findIndex(row => matches(row, query));
      return index === -1 ? null : rows.splice(index, 1)[0];
    }
  };
};

describe('the newsstand', () => {
  let server;
  let url;
  let Edition;
  let articles;
  let asAgent;
  let saved;

  beforeEach(async () => {
    Edition = makeStore();
    articles = [];
    asAgent = false;
    saved = [];
    const Article = {
      findOneAndUpdate: async (query, patch) => {
        const existing = articles.find(row => row.url === query.url && row.userId === query.userId);
        if (existing) return existing;
        const row = { _id: `article-${articles.length + 1}`, ...query, ...(patch.$setOnInsert || {}) };
        articles.push(row);
        return row;
      }
    };
    const app = express();
    app.use(express.json());
    app.use(buildEditionRouter({
      auth: (req, _res, next) => {
        req.user = { id: 'user-1' };
        if (asAgent) req.agentToken = { id: 'token-1', name: 'OpenClaw · Jarvis' };
        next();
      },
      humanOnly: (req, res, next) => (
        req.agentToken ? res.status(403).json({ error: 'Only you can do that, not an agent.' }) : next()
      ),
      Edition,
      Article,
      onArticleSaved: article => saved.push(article)
    }));
    server = await listen(app);
    url = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => server?.close());

  const send = async (path, method = 'GET', body) => {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: res.status, body: await res.json() };
  };

  it('takes a week from an agent and signs it', async () => {
    asAgent = true;
    const res = await send('/api/editions', 'POST', week());
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('This Week in AI');
    expect(res.body.writtenBy).toBe('OpenClaw · Jarvis');
    expect(res.body.items).toHaveLength(2);
  });

  /* The refusal is read by an agent that can fix it and try again, so it
     names the item and what is missing. */
  it('refuses an item that will not say what would limit it, and says which', async () => {
    asAgent = true;
    const res = await send('/api/editions', 'POST', week({ items: [item({ boundary: '' }), item()] }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/needs a boundary/);
    expect(res.body.field).toBe('boundary');
    expect(Edition.rows).toHaveLength(0);
  });

  /* An edition is maintained, not accumulated. Asked twice for one week it
     replaces itself rather than printing Tuesday again. */
  it('replaces its own edition for the same window', async () => {
    asAgent = true;
    await send('/api/editions', 'POST', week());
    const again = await send('/api/editions', 'POST', week({ standfirst: 'Second pass.' }));
    expect(again.status).toBe(200);
    expect(again.body.standfirst).toBe('Second pass.');
    expect(Edition.rows).toHaveLength(1);
  });

  it('keeps what the reader already took when the agent rewrites the week', async () => {
    asAgent = true;
    const made = await send('/api/editions', 'POST', week());
    asAgent = false;
    await send(`/api/editions/${made.body._id}/items/item-1/save`, 'POST');
    asAgent = true;
    const rewritten = await send('/api/editions', 'POST', week({ standfirst: 'Rewritten.' }));
    expect(rewritten.body.items[0].savedArticleId).toBe('article-1');
    expect(rewritten.body.savedCount).toBe(1);
  });

  /* An empty section is not a failure, it is the most useful sentence a week
     can print about itself. */
  it('says which sections the week never filled', async () => {
    asAgent = true;
    const res = await send('/api/editions', 'POST', week());
    expect(res.body.unfilled).toEqual(['Infrastructure & systems', 'Evaluation & counterevidence']);
  });

  describe('the save door', () => {
    it('takes a source across into the library and remembers that it did', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      const res = await send(`/api/editions/${made.body._id}/items/item-2/save`, 'POST');
      expect(res.status).toBe(200);
      expect(articles[0].url).toBe('https://example.com/two');
      expect(res.body.edition.items[1].savedArticleId).toBe('article-1');
      expect(saved).toHaveLength(1);
    });

    /* Keyed on the URL, like every other save, so taking a source you already
       own adopts your copy instead of forking it. */
    it('adopts a source the reader already owns', async () => {
      articles.push({ _id: 'mine', url: 'https://example.com/paper', userId: 'user-1' });
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      const res = await send(`/api/editions/${made.body._id}/items/item-1/save`, 'POST');
      expect(res.body.articleId).toBe('mine');
      expect(articles).toHaveLength(1);
    });

    /* An agent that could take sources into the library could fill it with
       its own reading. */
    it('is the reader\'s door, not the agent\'s', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      const res = await send(`/api/editions/${made.body._id}/items/item-1/save`, 'POST');
      expect(res.status).toBe(403);
      expect(articles).toHaveLength(0);
    });

    it('says so when the item is not in the paper', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      expect((await send(`/api/editions/${made.body._id}/items/nope/save`, 'POST')).status).toBe(404);
      expect((await send('/api/editions/missing/items/item-1/save', 'POST')).status).toBe(404);
    });
  });

  it('lists the stand without dragging every item along', async () => {
    asAgent = true;
    await send('/api/editions', 'POST', week());
    asAgent = false;
    const res = await send('/api/editions');
    expect(res.status).toBe(200);
    expect(res.body.editions).toHaveLength(1);
    expect(res.body.editions[0].items).toBeUndefined();
    expect(res.body.editions[0].itemCount).toBe(2);
  });

  it('opens one edition, and says so when there is none', async () => {
    asAgent = true;
    const made = await send('/api/editions', 'POST', week());
    asAgent = false;
    expect((await send(`/api/editions/${made.body._id}`)).body.items).toHaveLength(2);
    expect((await send('/api/editions/missing')).status).toBe(404);
  });

  /* An agent that could delete its own back issues could quietly rewrite what
     it told you last week. */
  it('lets the reader throw a paper out, and not the agent', async () => {
    asAgent = true;
    const made = await send('/api/editions', 'POST', week());
    expect((await send(`/api/editions/${made.body._id}`, 'DELETE')).status).toBe(403);
    asAgent = false;
    expect((await send(`/api/editions/${made.body._id}`, 'DELETE')).status).toBe(200);
    expect(Edition.rows).toHaveLength(0);
  });
});
