const express = require('express');
const { buildWikiRouter } = require('../wikiRoutes');

/**
 * The paper joins the ledger.
 *
 * The guarantee that matters most is that reading the paper is not the paper
 * asking again — a reader who refreshes five times has been asked once.
 */

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const DAY = 24 * 60 * 60 * 1000;
const dayBack = n => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

const claim = (over = {}) => ({
  claimId: 'c1',
  text: 'Alphabet capex is defensive, not offensive.',
  support: 'supported',
  bornAt: new Date(Date.now() - 500 * DAY).toISOString(),
  history: [],
  verdicts: [],
  ...over
});

const wikiPage = (over = {}) => ({
  _id: 'p1',
  title: 'Alphabet',
  updatedAt: new Date(Date.now() - DAY).toISOString(),
  claims: [claim()],
  sourceRefs: [{ _id: 's1' }],
  ...over
});

const query = (rows) => {
  const chain = { select: () => chain, sort: () => chain, limit: () => chain, lean: async () => rows };
  return chain;
};

describe('the morning paper keeps a record of itself', () => {
  let server;
  let url;
  let ledger;
  let pages;

  const start = async () => {
    const MorningPaperRecord = {
      find: () => query(ledger.map(row => ({ ...row }))),
      findOneAndUpdate: async (filter, doc) => {
        const index = ledger.findIndex(row => row.day === filter.day);
        if (index === -1) ledger.push({ ...doc });
        else ledger[index] = { ...doc };
        return doc;
      }
    };
    const app = express();
    app.use(express.json());
    app.use(buildWikiRouter({
      authenticateToken: (req, _res, next) => { req.user = { id: 'user-1' }; next(); },
      WikiPage: { find: () => query(pages) },
      MorningPaperRecord
    }));
    server = await listen(app);
    url = `http://127.0.0.1:${server.address().port}`;
  };

  const read = async () => {
    const res = await fetch(`${url}/api/morning-paper/columns`, { headers: { Authorization: 'Bearer t' } });
    return { status: res.status, body: await res.json() };
  };

  beforeEach(async () => {
    ledger = [];
    pages = [wikiPage()];
    await start();
  });

  afterEach(() => server?.close());

  it('writes down what it asked', async () => {
    const res = await read();
    expect(res.status).toBe(200);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].day).toBe(today());
    expect(ledger[0].assertions.map(a => a.kind)).toContain('anniversary');
  });

  /* A reader who refreshes five times has been asked once. */
  it('is one morning however many times it is read', async () => {
    await read();
    await read();
    await read();
    expect(ledger).toHaveLength(1);
    expect((await read()).body.asked).toBe(0);
  });

  it('counts the mornings it has asked before', async () => {
    const assertion = { kind: 'anniversary', targetKey: 'p1:c1', pageId: 'p1', label: 'Alphabet', text: 'x' };
    ledger = [
      { day: dayBack(1), assertions: [assertion] },
      { day: dayBack(3), assertions: [assertion] }
    ];
    expect((await read()).body.asked).toBe(2);
  });

  /* Each column deals one candidate a day, so a question missing from today's
     paper is usually somebody else's turn — not an answer. */
  it('does not call a question closed because it was not dealt today', async () => {
    ledger = [{
      day: dayBack(2),
      assertions: [{ kind: 'anniversary', targetKey: 'p1:c1', pageId: 'p1', label: 'Alphabet', text: 'x' }]
    }];
    /* Still unanswered: same page, same untouched claim. */
    expect((await read()).body.closed).toEqual([]);
  });

  it('reports a question the reader has since answered', async () => {
    ledger = [{
      day: dayBack(2),
      assertions: [{ kind: 'anniversary', targetKey: 'p1:c1', pageId: 'p1', label: 'Alphabet', text: 'x' }]
    }];
    /* Checked in since, so it no longer qualifies as unrevisited. */
    pages = [wikiPage({ claims: [claim({ lastCheckedAt: new Date().toISOString() })] })];
    const [closed] = (await read()).body.closed;
    expect(closed).toMatchObject({ kind: 'anniversary', label: 'Alphabet', vanished: false });
  });

  /* A quiet morning writes nothing, so the ledger records mornings that said
     something rather than every time the page was opened. */
  it('records nothing about a morning with nothing to say', async () => {
    pages = [wikiPage({ claims: [claim({ bornAt: new Date().toISOString() })] })];
    const res = await read();
    expect(res.body.anniversary).toBeNull();
    expect(ledger).toHaveLength(0);
  });
});
