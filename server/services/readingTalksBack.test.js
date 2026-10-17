const { fileReadingProposal, opposeFromNote, proposeFromReading, pushesAgainst, readingStands, viewBearingOn, PER_DAY } = require('./readingTalksBack');
const { buildReadingProposal, planJudgmentChangeDisposition } = require('./judgmentChangeProposalService');

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-11T12:00:00.000Z');

// Queries that resolve whether awaited directly or through .select().lean().
const query = (found) => {
  let value = found;
  const chain = {
    select: () => chain,
    sort: (order = {}) => {
      if (Array.isArray(value) && order.createdAt) value = [...value].sort((a, b) => order.createdAt * (a.createdAt - b.createdAt));
      return chain;
    },
    limit: (count) => { if (Array.isArray(value)) value = value.slice(0, count); return chain; },
    lean: async () => value,
    then: (ok, fail) => Promise.resolve(value).then(ok, fail)
  };
  return chain;
};

const matches = (row, filter) => Object.entries(filter).every(([key, want]) => {
  const have = key.split('.').reduce((value, part) => value?.[part], row);
  if (want && typeof want === 'object' && !(want instanceof Date)) {
    if ('$gte' in want) return have >= want.$gte;
    if ('$in' in want) return want.$in.map(String).includes(String(have));
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

describe('in the margin', () => {
  const marked = 'Warehouse club renewals barely dipped through the last downturn.';

  it('names the held view a marked passage bears on, by meaning', async () => {
    const { WikiPage } = world();
    expect(await viewBearingOn({ userId: 'u1', text: marked, WikiPage, embed })).toEqual({
      pageId: 'v1',
      view: 'Costco’s membership model makes it recession-resistant.'
    });
  });

  it('is silent on topic alone, without embeddings, and for a fragment', async () => {
    const { WikiPage } = world();
    const elsewhere = 'The bridge was painted a brighter shade of red last spring.';
    expect(await viewBearingOn({ userId: 'u1', text: elsewhere, WikiPage, embed })).toBeNull();
    expect(await viewBearingOn({ userId: 'u1', text: marked, WikiPage, embed: null })).toBeNull();
    expect(await viewBearingOn({ userId: 'u1', text: 'Membership renewals.', WikiPage, embed })).toBeNull();
  });

  it('does not offer a view again once this passage is filed under it or set aside', async () => {
    const origin = 'highlight:a1:h1';
    for (const judgment of [{ notAboutIds: [origin] }, { why: [{ acceptedFrom: origin }] }, { against: [{ acceptedFrom: origin }] }]) {
      const { WikiPage } = world();
      Object.assign(WikiPage.rows[0].judgment, judgment);
      expect(await viewBearingOn({ userId: 'u1', text: marked, origin, WikiPage, embed })).toBeNull();
      expect(await viewBearingOn({ userId: 'u1', text: marked, origin: 'highlight:a1:h2', WikiPage, embed })).toMatchObject({ pageId: 'v1' });
    }
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

  it('without a source, says the latest challenge any source made, and nothing for support', async () => {
    const models = world();
    await read(models, answer({ stance: 'support', quote }));
    expect(await pushesAgainst({ userId: 'u1', models })).toBeNull();

    const challenged = world();
    await read(challenged, answer({ stance: 'challenge', quote }));
    const found = await pushesAgainst({ userId: 'u1', models: challenged });
    expect(found).toMatchObject({ pageId: 'v1' });
    expect(found.proposal.provenance).toMatchObject({ stance: 'challenge', after: quote });
  });

  it('is not crowded out by newer readings of views since revised', async () => {
    const models = world();
    await read(models, answer({ stance: 'challenge', quote }));
    const later = new Date(now.getTime() + 60 * 1000);
    Array.from({ length: 12 }, (_, index) => models.NoeisReceipt.rows.push({
      userId: 'u1', receiptId: `stale${index}`, kind: 'judgment_change_proposal', status: 'pending', createdAt: later,
      provenance: { change: 'evidence', stance: 'challenge', pageId: 'v1', before: 'An older wording of the view.' }
    }));
    const found = await pushesAgainst({ userId: 'u1', models });
    expect(found).toMatchObject({ pageId: 'v1' });
    expect(found.proposal.provenance).toMatchObject({ after: quote });
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

  it('keeps a sentence no view answers as read, without asking', async () => {
    const models = setup();
    const complete = verdict({ verdict: 'contradicts', confidence: 'high' });
    const plain = 'The garden needs watering before the long weekend arrives.';
    expect(await check(models, note({ blocks: [{ id: 'b1', text: plain }] }), complete)).toBeNull();
    expect(complete).not.toHaveBeenCalled();
    const [kept] = models.NotebookEntry.updateOne.mock.calls[0][1].$push.viewReadings.$each;
    expect(kept).toMatchObject({ sentence: plain, verdict: 'unrelated', pageId: '' });
  });

  it('asks every sentence a view answers, not only the best match, and keeps none twice', async () => {
    const models = setup();
    const first = 'Costco membership renewals rose again this quarter across every region.';
    const complete = jest.fn(async ({ messages }) => ({
      text: JSON.stringify(messages[1].content.includes(OPPOSITE)
        ? { verdict: 'contradicts', confidence: 'high' }
        : { verdict: 'unrelated', confidence: 'high' })
    }));
    const line = await check(models, note({ blocks: [{ id: 'b1', text: `${first} ${OPPOSITE}` }] }), complete);
    expect(line).toMatchObject({ sentence: OPPOSITE });
    // Both sentences meet the view; neither is filed as read without being asked.
    const [filter, update] = models.NotebookEntry.updateOne.mock.calls[0];
    const kept = update.$push.viewReadings.$each;
    expect(kept).toHaveLength(complete.mock.calls.length);
    expect(kept.every(reading => reading.pageId === 'v1')).toBe(true);
    // An overlapping save that read these sentences first wins; nothing is kept twice.
    expect(filter['viewReadings.sentence'].$nin).toEqual(kept.map(reading => reading.sentence));

    // And when it did, this save shows nothing it did not keep.
    models.NotebookEntry.updateOne.mockResolvedValueOnce({ matchedCount: 0 });
    expect(await check(models, note({ blocks: [{ id: 'b1', text: `${first} ${OPPOSITE}` }] }), complete)).toBeNull();
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
    // A sentence still being typed is not asked yet.
    expect(await check(setup(), note({ blocks: [{ id: 'b1', text: OPPOSITE.slice(0, -1) }] }), complete)).toBeNull();
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('what would change your mind', () => {
  const TEST = 'Renewal rates fall for two straight quarters.';
  const MET = 'Renewal rates fell for two straight quarters, the first decline since the company began reporting them.';
  const withTest = (falsifier = {}, content = MET) => {
    const models = world();
    models.Article.rows[0].content = content;
    models.WikiPage.rows[0].judgment.falsifiers = [{ falsifierId: 'f1', text: TEST, status: 'unobserved', ...falsifier }];
    return models;
  };
  // The model answers each question for what it is: a test met, a sentence challenged.
  const reader = jest.fn(async ({ messages }) => ({
    text: JSON.stringify(messages[1].content.includes('change their mind if')
      ? { stance: 'meets', quote: MET }
      : { stance: 'challenge', quote: 'Costco renews nearly ninety percent of its members every year, even when wallets tighten.' })
  }));
  beforeEach(() => reader.mockClear());

  it('surfaces a passage that meets an open falsifier as a challenge that names it', async () => {
    const models = withTest();
    const [proposal] = await read(models, reader);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(reader.mock.calls[0][0].messages[1].content).toContain(`They said they would change their mind if: "${TEST}"`);
    expect(proposal.title).toBe('A passage that meets what would change your mind');
    expect(proposal.provenance).toMatchObject({ change: 'evidence', stance: 'challenge', falsifier: TEST, after: MET, articleId: 'a1' });
    expect(await read(models, reader)).toEqual([]);
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('asks a met test before the sentence, and files one proposal per view per source', async () => {
    const models = withTest({}, `${SOURCE} ${MET}`);
    const proposals = await read(models, reader);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].provenance.falsifier).toBe(TEST);
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the passage shares words but the model says it does not meet the test', async () => {
    const models = withTest();
    expect(await read(models, answer({ stance: 'nothing', quote: '' }))).toEqual([]);
    // A "meets" answer to the sentence question is not a verdict either.
    expect(await read(world(), answer({ stance: 'meets', quote: 'In 2009 traffic held while discretionary retailers saw double-digit declines.' }))).toEqual([]);
    expect(models.NoeisReceipt.rows).toHaveLength(0);
  });

  it('asks one test per view, so many tests on one view do not crowd out another', async () => {
    const models = withTest();
    models.WikiPage.rows[0].judgment.falsifiers = ['Renewal rates fall.', 'Renewal rates fall two quarters.', 'Renewal rates fall again.']
      .map((text, index) => ({ falsifierId: `f${index}`, text, status: 'unobserved' }));
    const nothing = answer({ stance: 'nothing', quote: '' });
    await read(models, nothing);
    const tests = nothing.mock.calls.filter(([{ messages }]) => messages[1].content.includes('change their mind if'));
    expect(tests).toHaveLength(1);
  });

  it('asks each view its sentence too, so views with tests cannot spend the budget on tests alone', async () => {
    const models = withTest({}, `${SOURCE} ${MET}`);
    const [first] = models.WikiPage.rows;
    models.WikiPage.rows.push(...[2, 3, 4, 5].map(n => ({ ...first, _id: `v${n}` })));
    const nothing = answer({ stance: 'nothing', quote: '' });
    await read(models, nothing);
    const sentences = nothing.mock.calls.filter(([{ messages }]) => !messages[1].content.includes('change their mind if'));
    expect(sentences.length).toBeGreaterThan(0);
  });

  it('notices a revised sentence however long it is', async () => {
    const models = withTest();
    const page = models.WikiPage.rows[0];
    page.judgment.currentJudgment = `${page.judgment.currentJudgment} ${'Because members renew. '.repeat(200)}`;
    const [proposal] = await read(models, reader);
    expect(readingStands(page, proposal)).toBe(true);
    page.judgment.currentJudgment = `${page.judgment.currentJudgment} Except in Japan.`;
    expect(readingStands(page, proposal)).toBe(false);
  });

  it('notices a reworded test however long it is', async () => {
    const long = `${TEST} ${'Measured by cohort. '.repeat(40)}`;
    const models = withTest({ text: long });
    const [proposal] = await read(models, reader);
    const page = models.WikiPage.rows[0];
    expect(readingStands(page, proposal)).toBe(true);
    page.judgment.falsifiers[0].text = `${long} Except in Japan.`;
    expect(readingStands(page, proposal)).toBe(false);
  });

  it('goes quiet once the test it met is retired or reworded', async () => {
    const models = withTest();
    const [proposal] = await read(models, reader);
    const page = models.WikiPage.rows[0];
    expect(readingStands(page, proposal)).toBe(true);
    page.judgment.falsifiers[0].status = 'retired';
    expect(readingStands(page, proposal)).toBe(false);
    page.judgment.falsifiers[0] = { falsifierId: 'f1', text: 'Renewals fall below eighty percent.', status: 'unobserved' };
    expect(readingStands(page, proposal)).toBe(false);
    // A proposal still on screen cannot be filed against the test it no longer meets.
    const fileJudgmentEvidence = jest.fn();
    await expect(fileReadingProposal({
      userId: 'u1', pageId: 'v1', receiptId: proposal.id, field: 'against', fileJudgmentEvidence, models, now
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(fileJudgmentEvidence).not.toHaveBeenCalled();
    expect(models.Article.rows[0].highlights || []).toEqual([]);
  });

  it('never asks a retired or triggered falsifier, and asks nothing without a model', async () => {
    expect(await read(withTest({ status: 'retired' }), reader)).toEqual([]);
    expect(await read(withTest({ status: 'triggered' }), reader)).toEqual([]);
    expect(await read(withTest(), reader, { configured: () => false })).toEqual([]);
    expect(reader).not.toHaveBeenCalled();
  });

  it('reads the criteria line as a test, in the signal’s words', () => {
    const { __testables: { asksOf, askedText } } = require('./readingTalksBack');
    const page = { _id: 'v1', judgment: {
      currentJudgment: 'Costco holds up.',
      resolutionCriteria: 'Renewals under eighty percent.',
      falsifiers: [{ text: 'Costco holds up.', observableSignal: 'Renewals under eighty percent.' }, { text: 'Fees cut.', status: 'warning' }]
    } };
    expect(asksOf(page).map(askedText)).toEqual(['Costco holds up.', 'Renewals under eighty percent.', 'Fees cut.']);
  });

  it('asks with a view\'s first three tests however many it lists', () => {
    const { __testables: { asksOf, askedText } } = require('./readingTalksBack');
    const falsifiers = Array.from({ length: 40 }, (_, index) => ({ text: `Signal ${index}.` }));
    const page = { _id: 'v1', judgment: { currentJudgment: 'Costco holds up.', falsifiers } };
    expect(asksOf(page).map(askedText)).toEqual(['Costco holds up.', 'Signal 0.', 'Signal 1.', 'Signal 2.']);
  });
});
