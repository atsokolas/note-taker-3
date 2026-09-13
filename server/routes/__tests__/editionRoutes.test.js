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
  const fieldOf = (row, key) => {
    if (key === 'items.url') return (row.items || []).map(item => item.url);
    if (key === 'items.itemId') return (row.items || []).map(item => item.itemId);
    return row[key];
  };
  const matchExpr = (row, expr) => {
    const [left, max] = expr?.$lte || [];
    const addends = left?.$add;
    if (!Array.isArray(addends) || addends.length !== 2) return false;
    return (row.items || []).length + Number(addends[1]) <= Number(max);
  };
  const matches = (row, query) => Object.entries(query).every(([key, value]) => {
    if (key === '$expr') return matchExpr(row, value);
    if (value instanceof Date) return new Date(row[key]).getTime() === value.getTime();
    if (value && typeof value === 'object' && Array.isArray(value.$nin)) {
      const held = fieldOf(row, key);
      const haystack = Array.isArray(held) ? held : [held];
      return value.$nin.every(candidate => !haystack.some(entry => String(entry) === String(candidate)));
    }
    return String(row[key]) === String(value);
  });
  const attach = row => Object.assign(row, { save: async () => { row.updatedAt = 'now'; } });
  return {
    rows,
    /* Awaitable, and .lean()-able, because the read paths ask for plain rows
       and the write paths ask for a document they can save. */
    findOne: (query) => {
      /* Mongoose throws CastError before it looks; the old store returned null
         and hid the 500 OpenClaw hit on get_edition with a profile key. */
      if (query._id && !String(query._id).startsWith('edition-')) {
        const error = new Error(`Cast to ObjectId failed for value "${query._id}"`);
        error.name = 'CastError';
        error.path = '_id';
        const rejected = Promise.reject(error);
        return { then: (resolve, reject) => rejected.then(resolve, reject), lean: () => rejected };
      }
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
      if (patch && (patch.$set || patch.$push)) {
        if (patch.$set) Object.assign(row, patch.$set);
        const each = patch.$push?.items?.$each;
        if (Array.isArray(each)) row.items = [...(row.items || []), ...each];
        return attach(row);
      }
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
  let EditionProfile;
  let articles;
  let asAgent;
  let saved;
  let shares;
  let readArticle;
  let skipShareLookups;

  beforeEach(async () => {
    Edition = makeStore();
    EditionProfile = makeStore();
    articles = [];
    asAgent = false;
    saved = [];
    shares = [];
    skipShareLookups = 0;
    readArticle = async () => ({ ok: true, url: '', title: 'The page’s own title', content: 'The body.', error: '' });
    const Article = {
      findOneAndUpdate: async (query, patch) => {
        const existing = articles.find((row) => {
          if (query._id) return String(row._id) === String(query._id);
          return row.url === query.url && row.userId === query.userId;
        });
        if (existing) {
          Object.assign(existing, patch.$set || {});
          return existing;
        }
        const row = { _id: `article-${articles.length + 1}`, ...query, ...(patch.$setOnInsert || {}) };
        articles.push(row);
        return row;
      }
    };
    const shareMatch = (row, query) => Object.entries(query)
      .every(([key, value]) => String(row[key]) === String(value));
    const SharedEdition = {
      findOne: (query) => ({
        lean: async () => {
          if (skipShareLookups > 0) {
            skipShareLookups -= 1;
            return null;
          }
          return shares.find(row => shareMatch(row, query)) || null;
        }
      }),
      create: async (doc) => {
        if (shares.some(row => String(row.userId) === String(doc.userId)
          && String(row.editionId) === String(doc.editionId))) {
          const error = new Error('E11000 duplicate key');
          error.code = 11000;
          throw error;
        }
        const row = { ...doc };
        shares.push(row);
        return row;
      },
      findOneAndUpdate: async (query, patch) => {
        const row = shares.find(entry => shareMatch(entry, query));
        if (!row) return null;
        Object.assign(row, patch.$set || patch);
        return row;
      },
      deleteOne: async (query) => {
        const index = shares.findIndex(row => shareMatch(row, query));
        if (index !== -1) shares.splice(index, 1);
        return { deletedCount: index === -1 ? 0 : 1 };
      }
    };
    const app = express();
    app.use(express.json());
    app.use(buildEditionRouter({
      auth: (req, _res, next) => {
        req.user = { id: 'user-1' };
        if (asAgent) req.agentToken = { id: 'token-1', label: 'OpenClaw · Jarvis' };
        next();
      },
      humanOnly: (req, res, next) => (
        req.agentToken ? res.status(403).json({ error: 'Only you can do that, not an agent.' }) : next()
      ),
      Edition,
      EditionProfile,
      Article,
      readArticle: (...args) => readArticle(...args),
      SharedEdition,
      User: { findById: () => ({ select: () => ({ lean: async () => ({ displayName: 'Athan' }) }) }) },
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

    /* The seam in "seamless": a source taken from an agent's paper used to
       arrive as a row you could file but not read. */
    /* The reader renders a body as HTML, so text saved raw is one unbroken run
       with no sentence to highlight — the seam this door exists to close. */
    it('arrives readable, paragraphed, with the page’s own title', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      const res = await send(`/api/editions/${made.body._id}/items/item-1/save`, 'POST');
      expect(res.body.readable).toBe(true);
      expect(articles[0].content).toBe('<p>The body.</p>');
      expect(articles[0].title).toBe('The page’s own title');
    });

    /* A paywall answering 403 is still a source worth keeping. The save must
       not be lost, and the reader must be told why the text is missing. */
    it('still saves when the source will not be read, and says why', async () => {
      readArticle = async () => ({ ok: false, url: '', title: '', content: '', error: 'That source request failed with HTTP 403.' });
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      const res = await send(`/api/editions/${made.body._id}/items/item-1/save`, 'POST');
      expect(res.status).toBe(200);
      expect(res.body.readable).toBe(false);
      expect(res.body.readError).toMatch(/403/);
      /* Filed anyway, under the agent's title, so the click is not lost. */
      expect(articles[0].title).toBe('A paper about scaling');
      expect(articles[0].content).toBe('');
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

  describe('sharing a paper', () => {
    const share = async (id, method = 'POST', body) => send(`/api/editions/${id}/share`, method, body);

    it('mints a link, and hands back the same one when asked twice', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      const first = await share(made.body._id);
      expect(first.status).toBe(201);
      expect(first.body.slug).toBeTruthy();
      /* A reader who already sent the first link must not end up with two
         live URLs for one paper. */
      const again = await share(made.body._id);
      expect(again.status).toBe(200);
      expect(again.body.slug).toBe(first.body.slug);
      expect(shares).toHaveLength(1);
    });

    /* An agent that could publish its own paper could publish on the
       reader's behalf, under the reader's name. */
    it('is the reader’s to publish, not the agent’s', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      expect((await share(made.body._id)).status).toBe(403);
      expect(shares).toHaveLength(0);
    });

    it('reads back whether a paper is shared', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      const before = await share(made.body._id, 'GET');
      expect(before.body.shared).toBe(false);
      expect(before.body.preview.title).toBe('This Week in AI');
      expect(before.body.currentHash).toBeTruthy();
      await share(made.body._id);
      expect((await share(made.body._id, 'GET')).body.shared).toBe(true);
    });

    /* Revoking removes the row, so the link stops resolving rather than
       resolving to a refusal that confirms the paper exists. */
    it('revokes, and the link stops resolving', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      const { body: { slug } } = await share(made.body._id);
      expect((await send(`/api/public/editions/${slug}`)).status).toBe(200);
      expect((await share(made.body._id, 'DELETE')).status).toBe(200);
      expect((await send(`/api/public/editions/${slug}`)).status).toBe(404);
    });

    /* A public edition is the reading. What the reader did with it afterwards
       is theirs. */
    it('publishes the paper and nothing about the reader', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      await send(`/api/editions/${made.body._id}/items/item-1/save`, 'POST');
      const { body: { slug } } = await share(made.body._id);

      const seen = await send(`/api/public/editions/${slug}`);
      expect(seen.status).toBe(200);
      expect(seen.body.title).toBe('This Week in AI');
      expect(seen.body.ownerDisplayName).toBe('Athan');
      expect(seen.body.savedCount).toBeUndefined();
      expect(seen.body.items.every(item => item.savedArticleId === undefined)).toBe(true);
      /* The standard still travels: every item carries its boundary. */
      expect(seen.body.items.every(item => item.boundary)).toBe(true);
    });

    it('says nothing about a slug that was never minted', async () => {
      expect((await send('/api/public/editions/nope')).status).toBe(404);
    });

    it('keeps the published snapshot when the private issue is rewritten', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week({ standfirst: 'First pass.' }));
      asAgent = false;
      const { body: { slug } } = await share(made.body._id);
      asAgent = true;
      await send('/api/editions', 'POST', week({ standfirst: 'Rewritten in private.' }));
      asAgent = false;
      const seen = await send(`/api/public/editions/${slug}`);
      expect(seen.body.standfirst).toBe('First pass.');
      const status = await share(made.body._id, 'GET');
      expect(status.body.stale).toBe(true);
    });

    it('updates the snapshot under the same slug when the owner asks', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week({ standfirst: 'First pass.' }));
      asAgent = false;
      const created = await share(made.body._id);
      asAgent = true;
      await send('/api/editions', 'POST', week({ standfirst: 'Second pass.' }));
      asAgent = false;
      const preview = await share(made.body._id, 'GET');
      const updated = await share(made.body._id, 'PUT', { previewHash: preview.body.currentHash });
      expect(updated.status).toBe(200);
      expect(updated.body.slug).toBe(created.body.slug);
      expect(updated.body.stale).toBe(false);
      const seen = await send(`/api/public/editions/${created.body.slug}`);
      expect(seen.body.standfirst).toBe('Second pass.');
    });

    it('refuses to publish a preview the issue has already left behind', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week({ standfirst: 'First pass.' }));
      asAgent = false;
      const preview = await share(made.body._id, 'GET');
      asAgent = true;
      await send('/api/editions', 'POST', week({ standfirst: 'Moved on.' }));
      asAgent = false;
      const stale = await share(made.body._id, 'POST', { previewHash: preview.body.currentHash });
      expect(stale.status).toBe(409);
      expect(shares).toHaveLength(0);
    });

    it('converges when two creates race the unique index', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      shares.push({
        userId: 'user-1',
        editionId: made.body._id,
        slug: 'held',
        ownerDisplayName: 'Athan',
        snapshot: { title: 'Held' },
        contentHash: 'abc',
        publishedAt: new Date().toISOString()
      });
      skipShareLookups = 1;
      const res = await share(made.body._id);
      expect(res.status).toBe(200);
      expect(res.body.slug).toBe('held');
      expect(shares).toHaveLength(1);
    });

    it('does not let an agent replace a published version', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      await share(made.body._id);
      asAgent = true;
      expect((await share(made.body._id, 'PUT', { previewHash: 'nope' })).status).toBe(403);
    });

    it('strips private fields instead of subtracting a few from the owner payload', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week({
        items: [
          item({ note: 'Editorial aside.', savedArticleId: 'should-not-leak' }),
          item({ title: 'A second', url: 'https://example.com/two' })
        ]
      }));
      asAgent = false;
      const { body: { slug } } = await share(made.body._id);
      const seen = await send(`/api/public/editions/${slug}`);
      expect(seen.body._id).toBeUndefined();
      expect(seen.body.userId).toBeUndefined();
      expect(seen.body.savedCount).toBeUndefined();
      expect(seen.body.items[0].savedArticleId).toBeUndefined();
      expect(seen.body.items[0].filedBy).toBeUndefined();
      expect(seen.body.items[0].note).toBe('Editorial aside.');
      expect(seen.body.items[0].url).toBe('https://example.com/paper');
    });

    it('does not cache a public edition after it has been revoked', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      const { body: { slug } } = await share(made.body._id);
      const live = await fetch(`${url}/api/public/editions/${slug}`);
      expect(live.headers.get('cache-control')).toMatch(/no-store/);
    });
  });

  describe('new arrivals', () => {
    it('lists unread items across papers, and drops one once it is opened', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      const inbox = await send('/api/editions/inbox');
      expect(inbox.status).toBe(200);
      expect(inbox.body.items).toHaveLength(2);
      await send(`/api/editions/${made.body._id}/items/item-1/state`, 'POST', { status: 'opened' });
      const after = await send('/api/editions/inbox');
      expect(after.body.items.map(row => row.itemId)).toEqual(['item-2']);
    });

    it('saves a source into Later and takes it out of New', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      const later = await send(`/api/editions/${made.body._id}/items/item-1/later`, 'POST');
      expect(later.status).toBe(200);
      expect(later.body.placed).toBe(true);
      expect(articles[0].placement).toBe('later');
      expect((await send('/api/editions/inbox')).body.items.map(row => row.itemId)).toEqual(['item-2']);
    });

    it('keeps the item’s id and the reader’s choice when the week is rewritten', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      await send(`/api/editions/${made.body._id}/items/item-1/state`, 'POST', { status: 'opened' });
      asAgent = true;
      const rewritten = await send('/api/editions', 'POST', week({
        items: [
          item({ title: 'A second', url: 'https://example.com/two' }),
          item({ title: 'A paper about scaling', url: 'https://example.com/paper' })
        ]
      }));
      const paper = rewritten.body.items.find(row => row.url.includes('/paper'));
      expect(paper.itemId).toBe('item-1');
      expect(paper.readerStatus).toBe('opened');
    });

    it('is the reader’s to triage, not the agent’s', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      expect((await send(`/api/editions/${made.body._id}/items/item-1/state`, 'POST', { status: 'dismissed' })).status).toBe(403);
      expect((await send(`/api/editions/${made.body._id}/items/item-1/later`, 'POST')).status).toBe(403);
    });

    it('restores a dismissed arrival', async () => {
      asAgent = true;
      const made = await send('/api/editions', 'POST', week());
      asAgent = false;
      await send(`/api/editions/${made.body._id}/items/item-1/state`, 'POST', { status: 'dismissed' });
      expect((await send('/api/editions/inbox')).body.items).toHaveLength(1);
      await send(`/api/editions/${made.body._id}/items/item-1/state`, 'POST', { status: 'new' });
      expect((await send('/api/editions/inbox')).body.items).toHaveLength(2);
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
    /* A profile key is not an edition id. Mongoose CastError used to 500 here. */
    const asProfile = await send('/api/editions/this_week_in_ai');
    expect(asProfile.status).toBe(404);
    expect(asProfile.body.error).toBe('No such edition.');
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

/**
 * A paper the reader configured, and kept up daily without losing Monday.
 */
describe('topics the reader configures, and filing into them', () => {
  let server;
  let url;
  let Edition;
  let EditionProfile;

  const listen2 = (app) => new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });

  beforeEach(async () => {
    Edition = makeStore();
    EditionProfile = makeStore();
    const app = express();
    app.use(express.json());
    app.use(buildEditionRouter({
      auth: (req, _res, next) => {
        req.user = { id: 'user-1' };
        req.agentToken = { id: 'token-1', label: 'OpenClaw · Jarvis' };
        next();
      },
      humanOnly: (req, res, next) => (
        req.agentToken ? res.status(403).json({ error: 'Only you can do that, not an agent.' }) : next()
      ),
      Edition,
      EditionProfile,
      Article: { findOneAndUpdate: async () => ({ _id: 'a1' }) }
    }));
    server = await listen2(app);
    url = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => server?.close());

  const send = async (path, method = 'GET', body) => {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  };

  const configure = (over = {}) => send('/api/edition-profiles', 'POST', {
    key: 'biotech',
    title: 'This Month in Biotech',
    cadence: 'monthly',
    sections: [{ key: 'clinical_evidence', label: 'Clinical evidence' }],
    ...over
  });

  const finding = (over = {}) => ({
    title: 'A trial reads out',
    url: 'https://example.com/one',
    section: 'clinical_evidence',
    finding: 'The trial reported a twelve point improvement.',
    boundary: 'Single site, n=40, no replication.',
    ...over
  });

  it('lets an agent configure a topic, and editing it does not open a second', async () => {
    const created = await configure();
    expect(created.status).toBe(201);
    expect(created.body.cadence).toBe('monthly');

    const edited = await configure({ cadence: 'weekly' });
    expect(edited.status).toBe(200);
    expect(edited.body.cadence).toBe('weekly');

    const listed = await send('/api/edition-profiles');
    expect(listed.body.profiles).toHaveLength(1);
    expect(listed.body.builtIn).toEqual(expect.arrayContaining(['this_week_in_ai']));
  });

  it('lets a paper have no columns, and does not invent evidence ones', async () => {
    const created = await configure({ sections: [] });
    expect(created.status).toBe(201);
    expect(created.body.sections).toEqual([]);

    const filed = await send('/api/editions/file', 'POST', {
      profile: 'biotech',
      items: [finding()]
    });
    expect(filed.status).toBe(201);
    expect(filed.body.sections).toEqual([]);
    expect(filed.body.itemCount).toBe(1);
  });

  it('keeps standing columns when an edit omits them', async () => {
    await configure();
    const edited = await send('/api/edition-profiles', 'POST', {
      key: 'biotech',
      title: 'This Month in Biotech',
      cadence: 'weekly'
    });
    expect(edited.status).toBe(200);
    expect(edited.body.sections).toEqual([{ key: 'clinical_evidence', label: 'Clinical evidence' }]);
  });

  it('puts those columns on the edition an agent files', async () => {
    await configure({
      sections: [
        { key: 'deployment', label: 'Deployment' },
        { key: 'policy', label: 'Policy' }
      ]
    });
    const filed = await send('/api/editions/file', 'POST', {
      profile: 'biotech',
      items: [finding({ section: 'deployment' })]
    });
    expect(filed.status).toBe(201);
    expect(filed.body.sections).toEqual([
      { key: 'deployment', label: 'Deployment' },
      { key: 'policy', label: 'Policy' }
    ]);
  });

  // The whole point: filing tomorrow must not delete today.
  it('adds to the running issue instead of replacing it', async () => {
    await configure();
    const monday = await send('/api/editions/file', 'POST', { profile: 'biotech', items: [finding()] });
    expect(monday.status).toBe(201);
    expect(monday.body.itemCount).toBe(1);

    const tuesday = await send('/api/editions/file', 'POST', {
      profile: 'biotech',
      items: [finding({ title: 'A second readout', url: 'https://example.com/two' })]
    });
    expect(tuesday.status).toBe(200);
    expect(tuesday.body.itemCount).toBe(2);
    expect(tuesday.body.added).toBe(1);
    expect(Edition.rows).toHaveLength(1);
  });

  it('skips a link the issue already holds rather than printing it twice', async () => {
    await configure();
    await send('/api/editions/file', 'POST', { profile: 'biotech', items: [finding()] });
    const again = await send('/api/editions/file', 'POST', { profile: 'biotech', items: [finding()] });
    expect(again.body.itemCount).toBe(1);
    expect(again.body.added).toBe(0);
    expect(again.body.alreadyHeld).toBe(1);
  });

  it('still demands a boundary when filing into a topic the reader invented', async () => {
    await configure();
    const bad = await send('/api/editions/file', 'POST', { profile: 'biotech', items: [finding({ boundary: '' })] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/boundary/i);
  });

  it('names the topics that exist when an agent files into one that does not', async () => {
    await configure();
    const bad = await send('/api/editions/file', 'POST', { profile: 'quantum', items: [finding()] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/biotech/);
  });

  it('files a daily topic into separate issues on separate days', async () => {
    await configure({ key: 'ai_daily', title: 'AI Daily', cadence: 'daily' });
    await send('/api/editions/file', 'POST', { profile: 'ai_daily', items: [finding()], now: '2026-09-09T10:00:00Z' });
    await send('/api/editions/file', 'POST', { profile: 'ai_daily', items: [finding({ url: 'https://example.com/two' })], now: '2026-09-10T10:00:00Z' });
    expect(Edition.rows).toHaveLength(2);
  });

  it('refuses a now that is not a date rather than 500ing the file', async () => {
    await configure();
    const bad = await send('/api/editions/file', 'POST', { profile: 'biotech', items: [finding()], now: 'yesterday' });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe('now');
    expect(Edition.rows).toHaveLength(0);
  });

  it('lands in the running issue when two filings race the window', async () => {
    await configure();
    const first = await send('/api/editions/file', 'POST', { profile: 'biotech', items: [finding()] });
    expect(first.status).toBe(201);

    const originalFindOne = Edition.findOne;
    const originalCreate = Edition.create;
    let skipped = 1;
    Edition.findOne = (query) => {
      if (skipped > 0 && query.profile) {
        skipped -= 1;
        return { then: (resolve, reject) => Promise.resolve(null).then(resolve, reject), lean: async () => null };
      }
      return originalFindOne(query);
    };
    Edition.create = async () => {
      const error = new Error('E11000 duplicate key');
      error.code = 11000;
      throw error;
    };
    try {
      const raced = await send('/api/editions/file', 'POST', {
        profile: 'biotech',
        items: [finding({ title: 'A second readout', url: 'https://example.com/two' })]
      });
      expect(raced.status).toBe(200);
      expect(raced.body.itemCount).toBe(2);
      expect(raced.body.added).toBe(1);
      expect(Edition.rows).toHaveLength(1);
    } finally {
      Edition.findOne = originalFindOne;
      Edition.create = originalCreate;
    }
  });

  /* Two losers of the same create can fetch one snapshot, merge independently,
     and — if filing replaces `items` — the last write drops the other item
     while both receipts say added: 1. $push keeps both. */
  it('keeps every concurrent filing when two agents lose the same create race', async () => {
    await configure();
    const first = await send('/api/editions/file', 'POST', { profile: 'biotech', items: [finding()] });
    expect(first.status).toBe(201);

    const originalFindOne = Edition.findOne;
    const originalCreate = Edition.create;
    const snapshot = JSON.parse(JSON.stringify(Edition.rows[0]));
    Edition.findOne = (query) => {
      if (query.profile && !query._id) {
        const stale = Object.assign(JSON.parse(JSON.stringify(snapshot)), { save: async () => {} });
        return { then: (resolve, reject) => Promise.resolve(stale).then(resolve, reject), lean: async () => JSON.parse(JSON.stringify(snapshot)) };
      }
      return originalFindOne(query);
    };
    Edition.create = async () => {
      const error = new Error('E11000 duplicate key');
      error.code = 11000;
      throw error;
    };
    try {
      const [second, third] = await Promise.all([
        send('/api/editions/file', 'POST', {
          profile: 'biotech',
          items: [finding({ title: 'A second readout', url: 'https://example.com/two' })]
        }),
        send('/api/editions/file', 'POST', {
          profile: 'biotech',
          items: [finding({ title: 'A third readout', url: 'https://example.com/three' })]
        })
      ]);
      expect(second.status).toBe(200);
      expect(third.status).toBe(200);
      expect(second.body.added).toBe(1);
      expect(third.body.added).toBe(1);
      expect(Edition.rows).toHaveLength(1);
      expect(Edition.rows[0].items.map(row => row.url).sort()).toEqual([
        'https://example.com/one',
        'https://example.com/three',
        'https://example.com/two'
      ]);
      const listed = await send('/api/editions');
      expect(listed.body.editions[0].itemCount).toBe(3);
    } finally {
      Edition.findOne = originalFindOne;
      Edition.create = originalCreate;
    }
  });
});

/**
 * Who filed what. The masthead names whoever wrote last, which stops being the
 * whole truth the moment two agents keep the same paper.
 */
describe('a section keeps its own byline', () => {
  let server;
  let url;
  let Edition;
  let EditionProfile;
  let agent;

  const listen3 = (app) => new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  beforeEach(async () => {
    Edition = makeStore();
    EditionProfile = makeStore();
    agent = 'Jarvis';
    const app = express();
    app.use(express.json());
    app.use(buildEditionRouter({
      auth: (req, _res, next) => {
        req.user = { id: 'user-1' };
        req.agentToken = { id: 'token-1', label: agent };
        next();
      },
      Edition,
      EditionProfile,
      Article: { findOneAndUpdate: async () => ({ _id: 'a1' }) }
    }));
    server = await listen3(app);
    url = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => server?.close());

  const send = async (path, method, body) => {
    const response = await fetch(`${url}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  };

  const finding = (over = {}) => ({
    title: 'A paper', url: 'https://example.com/one', section: 'models_methods',
    finding: 'It reports a twelve point improvement.',
    boundary: 'One lab, n=40, no replication.',
    ...over
  });

  it('signs each item with the agent that filed it, not the one that filed last', async () => {
    await send('/api/editions/file', 'POST', { profile: 'this_week_in_ai', items: [finding()] });
    agent = 'Hermes';
    const second = await send('/api/editions/file', 'POST', {
      profile: 'this_week_in_ai',
      items: [finding({ url: 'https://example.com/two', section: 'evaluation_counterevidence' })]
    });
    expect(second.body.items.map(item => item.filedBy)).toEqual(['Jarvis', 'Hermes']);
    /* The masthead moves to whoever wrote last; the items do not. */
    expect(second.body.writtenBy).toBe('Hermes');
  });

  /* An agent's claim about its own name is not evidence. */
  it('takes the byline from the token, not from what the caller says it is', async () => {
    const filed = await send('/api/editions/file', 'POST', {
      profile: 'this_week_in_ai', writtenBy: 'Somebody Else', items: [finding()]
    });
    expect(filed.body.items[0].filedBy).toBe('Jarvis');
  });

  /* A rewrite is not a reassignment: the byline an earlier filing earned
     survives it, the way a save the reader made does. */
  it('keeps an earlier byline through a whole-issue rewrite', async () => {
    await send('/api/editions/file', 'POST', { profile: 'this_week_in_ai', items: [finding()] });
    agent = 'Hermes';
    const rewritten = await send('/api/editions', 'POST', {
      profile: 'this_week_in_ai',
      windowStart: Edition.rows[0].windowStart,
      windowEnd: Edition.rows[0].windowEnd,
      items: [finding(), finding({ url: 'https://example.com/three' })]
    });
    expect(rewritten.body.items.map(item => item.filedBy)).toEqual(['Jarvis', 'Hermes']);
  });
});

describe('the edition document', () => {
  const mongoose = require('mongoose');
  const { Edition } = require('../../models');

  it('keeps a byline when the token id is not an ObjectId', () => {
    const doc = new Edition({
      userId: new mongoose.Types.ObjectId(),
      profile: 'this_week_in_ai',
      title: 'This Week in AI',
      windowStart: new Date('2026-09-06'),
      windowEnd: new Date('2026-09-12'),
      writtenBy: { label: 'OpenClaw · Jarvis', agentTokenId: 'token-1' },
      items: [{
        itemId: 'item-1',
        title: 'A paper',
        url: 'https://example.com/a',
        finding: 'It reports a twelve point improvement.',
        boundary: 'One lab.',
        filedBy: { label: 'OpenClaw · Jarvis', agentTokenId: 'token-1' }
      }]
    });
    expect(doc.validateSync()).toBeUndefined();
  });
});
