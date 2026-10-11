const { fileReadingProposal, opposeFromNote, proposeFromReading, pushesAgainst, PER_DAY } = require('./readingTalksBack');
const { buildReadingProposal, planJudgmentChangeDisposition } = require('./judgmentChangeProposalService');

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-11T12:00:00.000Z');

// Queries that resolve whether awaited directly or through .select().lean().
const query = (value) => {
  const chain = { select: () => chain, sort: () => chain, limit: () => chain, lean: async () => value, then: (ok, fail) => Promise.resolve(value).then(ok, fail) };
  return chain;
};

const matches = (row, filter) => Object.entries(filter).every(([key, want]) => {
  const have = key.split('.').reduce((value, part) => value?.[part], row);
  if (want && typeof want === 'object' && !(want instanceof Date)) {
    if ('$gte' in want) return have >= want.$gte;
    if ('$ne' in want) return have !== want.$ne && !(want.$type && typeof have !== want.$type);
    return true;
  }
  return String(have) === String(want);
});

const collection = (rows = []) => ({
  rows,
  find: jest.fn(filter => query(rows.filter(row => matches(row, filter)))),
  findOne: jest.fn(filter => query(rows.find(row => matches(row, filter)) || null)),
  countDocuments: jest.fn(async filter => rows.filter(row => matches(row, filter)).length),
  findOneAndUpdate: jest.fn((filter, update) => {
    let row = rows.find(item => matches(item, filter));
    if (!row) { row = { ...filter, createdAt: now }; rows.push(row); }
    if (update.$set) Object.assign(row, update.$set);
    if (update.$push) {
      Object.entries(update.$push).forEach(([key, value]) => {
        row[key] = [...(row[key] || []), { _id: `h${(row[key] || []).length + 1}`, ...value }];
      });
    }
    return query(row);
  })
});

const SOURCE = [
  'Costco renews nearly ninety percent of its members every year, even when wallets tighten.',
  'In 2009 traffic held while discretionary retailers saw double-digit declines.',
  'The membership fee is paid up front, so the margin arrives before the shopping does.'
].join(' ');

const world = ({ heldAt = new Date(now.getTime() - 30 * DAY), receipts = [] } = {}) => ({
  Article: collection([{
    _id: 'a1', userId: 'u1', title: 'Costco and the Membership Moat', author: 'Ben Carlson',
    content: SOURCE, createdAt: new Date(now.getTime() - DAY), highlights: []
  }]),
  WikiPage: collection([{
    _id: 'v1', userId: 'u1', title: 'Costco', createdAt: heldAt, status: 'active',
    judgment: { currentJudgment: 'Costco’s membership model makes it recession-resistant.', startedAt: heldAt, why: [], against: [], verdicts: [] }
  }]),
  NoeisReceipt: collection(receipts)
});

const event = { _id: 'e1', userId: 'u1', sourceType: 'article', sourceObjectId: 'a1' };
const answer = body => jest.fn(async () => ({ text: JSON.stringify(body) }));
const read = (models, complete, extra = {}) => proposeFromReading({
  event, userId: 'u1', models, complete, configured: () => true, embed: null, now, ...extra
});

// Stub embeddings: texts about membership and downturns sit together.
const embed = jest.fn(async texts => texts.map(text => (
  /membership|recession|renewal|downturn|fee/i.test(text) ? [1, 0.1] : [0.1, 1]
)));

describe('reading talks back', () => {
  it('proposes a passage when the model finds support and quotes the source verbatim', async () => {
    const models = world();
    const complete = answer({ stance: 'support', quote: 'In 2009 traffic held while discretionary retailers saw double-digit declines.' });
    const [proposal] = await read(models, complete);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].messages[1].content).toMatch(/support, challenge, or say nothing about this exact sentence/);
    expect(proposal.kind).toBe('judgment_change_proposal');
    expect(proposal.status).toBe('pending');
    expect(proposal.provenance).toMatchObject({ change: 'evidence', stance: 'support', articleId: 'a1', author: 'Ben Carlson' });
    // One per view per source: the same arrival read again asks nothing.
    expect(await read(models, complete)).toEqual([]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the passage only shares words with the view', async () => {
    const models = world();
    expect(await read(models, answer({ stance: 'nothing', quote: '' }))).toEqual([]);
    expect(models.NoeisReceipt.rows).toHaveLength(0);
  });

  it('drops a verdict whose quote is not on the page', async () => {
    const models = world();
    const invented = answer({ stance: 'challenge', quote: 'Costco members cancel in droves the moment a recession begins.' });
    expect(await read(models, invented)).toEqual([]);
    expect(models.NoeisReceipt.rows).toHaveLength(0);
  });

  it('asks nothing once three passages were proposed today', async () => {
    const receipts = Array.from({ length: PER_DAY }, (_, index) => ({
      userId: 'u1', receiptId: `r${index}`, kind: 'judgment_change_proposal', createdAt: new Date(now.getTime() - 60 * 1000),
      provenance: { change: 'evidence' }
    }));
    const complete = answer({ stance: 'support', quote: 'In 2009 traffic held while discretionary retailers saw double-digit declines.' });
    expect(await read(world({ receipts }), complete)).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it('is silent without a model, and never reads a source saved before the view was held', async () => {
    const complete = answer({ stance: 'support', quote: 'In 2009 traffic held while discretionary retailers saw double-digit declines.' });
    expect(await read(world(), complete, { configured: () => false })).toEqual([]);
    expect(await read(world({ heldAt: now }), complete)).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
  });

  it('files a pending passage as a highlight through the evidence path and closes it', async () => {
    const models = world();
    const quote = 'In 2009 traffic held while discretionary retailers saw double-digit declines.';
    const [proposal] = await read(models, answer({ stance: 'challenge', quote }));
    const fileJudgmentEvidence = jest.fn(async () => ({ idempotent: false, page: { _id: 'v1' } }));
    const result = await fileReadingProposal({
      userId: 'u1', pageId: 'v1', receiptId: proposal.id, field: 'against', fileJudgmentEvidence, models, now
    });
    expect(models.Article.rows[0].highlights).toEqual([expect.objectContaining({ _id: 'h1', text: quote })]);
    expect(fileJudgmentEvidence).toHaveBeenCalledWith(expect.objectContaining({ field: 'against', articleId: 'a1', highlightId: 'h1' }));
    expect(result.proposal).toMatchObject({ status: 'accepted', provenance: expect.objectContaining({ disposition: 'file_against' }) });
  });

  it('marks a passage not relevant with a line in the record, and never rewrites the view', () => {
    const page = world().WikiPage.rows[0];
    const article = { _id: 'a1', title: 'Costco and the Membership Moat' };
    const stored = { ...buildReadingProposal({ page, article, stance: 'support', quote: 'Costco renews nearly ninety percent of its members.', now }), receiptId: undefined };
    const planned = planJudgmentChangeDisposition({ receipt: stored, page, action: 'reject', now });
    expect(planned.judgment.currentJudgment).toBe(page.judgment.currentJudgment);
    expect(planned.judgment.decisions.at(-1).summary).toBe('Not relevant: a passage from Costco and the Membership Moat.');
    expect(() => planJudgmentChangeDisposition({ receipt: stored, page, action: 'accept', now })).toThrow(/for or against/);
  });
});

describe('reading talks back, by meaning', () => {
  const WAREHOUSE = 'Warehouse club renewals barely dipped through the last downturn. Shoppers kept paying the annual fee even while they cut back on almost everything else.';
  const unworded = () => {
    const models = world();
    models.Article.rows[0].content = WAREHOUSE;
    return models;
  };
  const quote = 'Warehouse club renewals barely dipped through the last downturn.';

  it('finds a view the source shares no words with when embeddings are on', async () => {
    const complete = answer({ stance: 'support', quote });
    const [proposal] = await read(unworded(), complete, { embed });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].messages[1].content).toContain('Warehouse club renewals');
    expect(proposal.provenance).toMatchObject({ stance: 'support', after: quote });
  });

  it('falls back to words alone, deterministically, when embeddings are off or fail', async () => {
    const complete = answer({ stance: 'support', quote });
    expect(await read(unworded(), complete)).toEqual([]);
    expect(await read(unworded(), complete, { embed: async () => { throw new Error('402'); } })).toEqual([]);
    expect(complete).not.toHaveBeenCalled();
    // A source that shares the view's words is still read without embeddings.
    expect(await read(world(), answer({ stance: 'nothing', quote: '' }))).toEqual([]);
  });
});

describe('the reader version', () => {
  const quote = 'In 2009 traffic held while discretionary retailers saw double-digit declines.';

  it('says the pending challenge this source already made, while the view is held in the same words', async () => {
    const models = world();
    await read(models, answer({ stance: 'challenge', quote }));
    const found = await pushesAgainst({ userId: 'u1', articleId: 'a1', models });
    expect(found).toMatchObject({ pageId: 'v1', view: 'Costco’s membership model makes it recession-resistant.' });
    expect(found.proposal.provenance).toMatchObject({ stance: 'challenge', articleId: 'a1' });

    models.WikiPage.rows[0].judgment.currentJudgment = 'Costco is a toll road on suburban errands.';
    expect(await pushesAgainst({ userId: 'u1', articleId: 'a1', models })).toBeNull();
  });

  it('is silent for support, and for a source with nothing waiting', async () => {
    const models = world();
    await read(models, answer({ stance: 'support', quote }));
    expect(await pushesAgainst({ userId: 'u1', articleId: 'a1', models })).toBeNull();
    expect(await pushesAgainst({ userId: 'u1', articleId: 'a2', models })).toBeNull();
  });
});

describe('you hold the opposite', () => {
  const OPPOSITE = 'When a real recession comes, Costco members cancel their membership faster than anyone expects.';
  const note = (over = {}) => ({
    _id: 'n1',
    blocks: [{ id: 'b1', type: 'paragraph', text: `Notes from the call. ${OPPOSITE}` }],
    viewReadings: [],
    ...over
  });
  const setup = () => {
    const models = world();
    models.NotebookEntry = { updateOne: jest.fn(async () => ({})) };
    return models;
  };
  const verdict = (body) => jest.fn(async () => ({ text: JSON.stringify(body) }));
  const check = (models, entry, complete, extra = {}) => opposeFromNote({
    entry, userId: 'u1', models, complete, configured: () => true, embed: null, now, ...extra
  });

  it('names the sentence and the view it contradicts, once, and keeps the verdict on the note', async () => {
    const models = setup();
    const complete = verdict({ verdict: 'contradicts', confidence: 'high' });
    const line = await check(models, note(), complete);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].messages[1].content).toContain(OPPOSITE);
    expect(line).toMatchObject({
      sentence: OPPOSITE,
      blockId: 'b1',
      pageId: 'v1',
      view: 'Costco’s membership model makes it recession-resistant.'
    });
    const [, update] = models.NotebookEntry.updateOne.mock.calls[0];
    const [kept] = update.$push.viewReadings.$each;
    expect(kept).toMatchObject({ key: line.key, verdict: 'contradicts', sentence: OPPOSITE, pageId: 'v1' });

    // The next save asks nothing; the line stands while sentence and view do.
    const again = await check(models, note({ viewReadings: [kept] }), complete, { configured: () => false });
    expect(again).toMatchObject({ key: line.key });
    expect(complete).toHaveBeenCalledTimes(1);
    // Rewrite the sentence and the line goes.
    expect(await check(models, note({ viewReadings: [kept], blocks: [{ id: 'b1', text: 'Notes from the call.' }] }), complete)).toBeNull();
  });

  it('never repeats a line set aside, and never asks that pair again', async () => {
    const models = setup();
    const line = await check(models, note(), verdict({ verdict: 'contradicts', confidence: 'high' }));
    const [kept] = models.NotebookEntry.updateOne.mock.calls[0][1].$push.viewReadings.$each;
    const complete = verdict({ verdict: 'contradicts', confidence: 'high' });
    expect(await check(models, note({ viewReadings: [{ ...kept, dismissedAt: now }] }), complete)).toBeNull();
    expect(complete).not.toHaveBeenCalled();
    expect(line.key).toBe(kept.key);
  });

  it('stays silent on support, on an unsure contradiction, on shared words, and without a model', async () => {
    for (const body of [
      { verdict: 'supports', confidence: 'high' },
      { verdict: 'contradicts', confidence: 'low' },
      { verdict: 'unrelated', confidence: 'high' }
    ]) {
      expect(await check(setup(), note(), verdict(body))).toBeNull();
    }
    const complete = verdict({ verdict: 'contradicts', confidence: 'high' });
    expect(await check(setup(), note(), complete, { configured: () => false })).toBeNull();
    expect(await check(setup(), note({ blocks: [{ id: 'b1', text: 'Too short to read.' }] }), complete)).toBeNull();
    expect(complete).not.toHaveBeenCalled();
  });
});
