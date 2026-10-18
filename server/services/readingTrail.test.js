const express = require('express');
const { buildTrail } = require('./readingTrail');
const { buildLibraryRelevanceRouter } = require('../routes/libraryRelevanceRoutes');

// A stand-in for a Mongoose model whose queries resolve to the given rows;
// the trail runs the thought partner's own retrieval over it.
const model = (rows = []) => ({
  find: jest.fn((filter) => {
    const ids = filter?._id?.$in;
    const result = ids ? rows.filter(row => ids.includes(String(row._id))) : rows;
    const query = { select: () => query, sort: () => query, limit: () => query, lean: async () => result };
    return query;
  }),
  countDocuments: jest.fn(async () => rows.length + 20)
});

const library = (rows) => ({
  Article: model(rows),
  NotebookEntry: model([]),
  TagMeta: model([])
});

const saved = [
  {
    _id: 'frontier',
    title: 'Scaling laws for attention',
    author: 'A. Researcher',
    publicationDate: '2024-03-01',
    content: 'Attention cost grows with sequence length, and attention variants trade accuracy for speed.',
    highlights: [{ _id: 'h-frontier', text: 'Attention variants trade accuracy for speed.' }]
  },
  {
    _id: 'foundation',
    title: 'Attention, explained from the start',
    siteName: 'Field Notes',
    publicationDate: '2017-06-12',
    content: 'Attention lets a model weigh every word against every other word in a sentence.'
  }
];

const answer = body => async () => ({ text: JSON.stringify(body) });
const lay = (options = {}) => buildTrail({
  userId: 'u1',
  subject: 'attention',
  models: library(saved),
  search: null,
  configured: () => true,
  ...options
});

describe('a reading trail', () => {
  it('orders your own pieces as the model lays them, each with the passage that put it there', async () => {
    const trail = await lay({
      complete: answer({
        path: [
          { mine: 'm2', why: 'The idea itself, before its costs.' },
          { mine: 'm1', why: 'Where the cost of it is argued now.' }
        ],
        gap: 'Nothing here says how attention was first used in translation.'
      })
    });
    expect(trail.ordered).toBe('path');
    const ids = trail.steps.map(step => step.articleId);
    const frontier = trail.steps.find(step => step.articleId === 'frontier');
    expect(ids).toHaveLength(2);
    expect(trail.steps[0].why).toBe('The idea itself, before its costs.');
    expect(frontier).toMatchObject({ kind: 'mine', marked: true, highlightId: 'h-frontier', passage: 'Attention variants trade accuracy for speed.' });
    expect(trail.steps.find(step => step.articleId === 'foundation')).toMatchObject({ author: 'Field Notes', marked: false });
    expect(trail.gap).toMatch(/translation/);
  });

  it('names outside works by title and author only, never with a link, and only to fill a named gap', async () => {
    const trail = await lay({
      complete: answer({
        path: [
          { title: 'Neural Machine Translation by Jointly Learning to Align and Translate', author: 'Bahdanau, Cho, Bengio', why: 'Where attention began.', url: 'https://made-up.example/paper.pdf' },
          { mine: 'm1', why: 'The cost now.' },
          { title: 'Attention Is All You Need', author: 'Vaswani et al.', why: 'The turn.', link: 'https://made-up.example/vaswani' },
          { title: 'A work with no author', why: 'Unnamed.' },
          { title: 'https://made-up.example/as-a-title', author: 'Nobody', why: 'A link posing as a title.' },
          { title: 'Third', author: 'C', why: 'Third.' },
          { title: 'Fourth', author: 'D', why: 'Past the limit.' },
          { mine: 'm9', why: 'A label nobody was given.' }
        ],
        gap: 'Your pieces skip where attention came from.'
      })
    });
    const outside = trail.steps.filter(step => step.kind === 'outside');
    expect(outside.map(step => step.title)).toEqual([
      'Neural Machine Translation by Jointly Learning to Align and Translate',
      'Attention Is All You Need',
      'Third'
    ]);
    outside.forEach(step => expect(Object.keys(step).sort()).toEqual(['author', 'kind', 'title', 'why']));
    expect(JSON.stringify(trail)).not.toMatch(/https?:/);
    expect(trail.steps).toHaveLength(4);
  });

  it('adds no outside works when the model names no gap', async () => {
    const trail = await lay({
      complete: answer({ path: [{ mine: 'm1', why: 'x' }, { title: 'Something', author: 'Someone', why: 'y' }], gap: '' })
    });
    expect(trail.steps.map(step => step.kind)).toEqual(['mine']);
  });

  it('without a model, shows your own pieces oldest first, with no gap and nothing from outside', async () => {
    const complete = jest.fn();
    const trail = await lay({ configured: () => false, complete });
    expect(complete).not.toHaveBeenCalled();
    expect(trail).toMatchObject({ ordered: 'date', gap: '', empty: false });
    expect(trail.steps.map(step => step.articleId)).toEqual(['foundation', 'frontier']);
    expect(trail.steps.every(step => step.kind === 'mine' && step.why === '')).toBe(true);
  });

  it('falls back to the dates when the model fails or keeps none of your pieces', async () => {
    const failed = await lay({ complete: async () => { throw new Error('upstream'); } });
    const invented = await lay({ complete: answer({ path: [{ mine: 'm7', why: 'no' }, { title: 'T', author: 'A', why: 'w' }], gap: 'g' }) });
    [failed, invented].forEach((trail) => {
      expect(trail.ordered).toBe('date');
      expect(trail.steps.map(step => step.articleId)).toEqual(['foundation', 'frontier']);
    });
  });

  it('with nothing saved on the subject, offers only outside works, and only with a model', async () => {
    const empty = { models: library([]), subject: 'the French Revolution' };
    const withModel = await lay({
      ...empty,
      complete: answer({ path: [{ title: 'Citizens', author: 'Simon Schama', why: 'A narrative way in.' }], gap: 'You have saved nothing on it.' })
    });
    expect(withModel).toMatchObject({ empty: true, ordered: 'path' });
    expect(withModel.steps).toEqual([{ kind: 'outside', title: 'Citizens', author: 'Simon Schama', why: 'A narrative way in.' }]);

    const without = await lay({ ...empty, configured: () => false });
    expect(without).toMatchObject({ empty: true, steps: [], gap: '' });
  });
});

describe('GET /api/library/trail', () => {
  const serve = () => {
    const app = express();
    app.use(buildLibraryRelevanceRouter({
      authenticateToken: (req, _res, next) => { req.user = { id: 'u1' }; next(); },
      trail: { search: null, configured: () => false },
      ...library(saved)
    }));
    return app.listen(0);
  };

  it('needs a subject, and lays the trail for one', async () => {
    const server = serve();
    const base = `http://127.0.0.1:${server.address().port}/api/library/trail`;
    try {
      expect((await fetch(base)).status).toBe(400);
      const response = await fetch(`${base}?subject=attention`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ subject: 'attention', ordered: 'date' });
      expect(body.steps).toHaveLength(2);
    } finally {
      server.close();
    }
  });
});
