const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildResearchLedgerEntry,
  initialLedgerPage,
  persistResearchLedgerEntry
} = require('./researchOperatingLedgerService');

const baseInput = () => ({
  thesisPageId: 'thesis-001',
  month: '2026-07',
  phase: 'frame',
  status: 'completed',
  summary: 'Recorded the research frame without inventing the founder prior.',
  unknowns: ['Which bottleneck captures the value?', 'Which assumptions are falsifiable?'],
  nextAction: 'Conduct the guided prior session with Athan.',
  recordedAt: '2026-07-20T14:00:00.000Z'
});

test('buildResearchLedgerEntry creates deterministic private monthly continuity keys', () => {
  const entry = buildResearchLedgerEntry(baseInput());
  assert.equal(entry.ledgerKey, 'research-ledger:2026-07:thesis-001');
  assert.equal(entry.entryKey, 'frame:2026-07-20');
  assert.equal(entry.receiptId, 'research-ledger:2026-07:thesis-001:frame:2026-07-20');
  assert.equal(entry.outputType, 'not_yet_determined');
});

test('ledger permits honest material outputs and rejects invented calendar filler', () => {
  const preserved = buildResearchLedgerEntry({
    ...baseInput(),
    phase: 'decision',
    status: 'no_material_change',
    outputType: 'preserved_judgment_note',
    summary: 'Evidence did not warrant changing the maintained judgment.'
  });
  assert.equal(preserved.outputType, 'preserved_judgment_note');
  assert.throws(() => buildResearchLedgerEntry({ ...baseInput(), outputType: 'forced_newsletter' }), /outputType/);
  assert.throws(() => buildResearchLedgerEntry({ ...baseInput(), summary: '   ' }), /summary is required/);
});

test('ledger rejects malformed collections and unsupported human dispositions', () => {
  assert.throws(() => buildResearchLedgerEntry({ ...baseInput(), unknowns: 'not-an-array' }), /unknowns must be an array/);
  assert.throws(() => buildResearchLedgerEntry({ ...baseInput(), friction: { note: 'hidden loss' } }), /friction must be an array/);
  assert.throws(() => buildResearchLedgerEntry({
    ...baseInput(),
    dispositions: [{ subjectId: 'claim-1', disposition: 'auto_accepted' }]
  }), /disposition is not supported/);
});

test('initial ledger page is a private canonical Wiki log, not a parallel thesis object', () => {
  const entry = buildResearchLedgerEntry(baseInput());
  const page = initialLedgerPage(entry);
  assert.equal(page.pageType, 'log');
  assert.equal(page.status, 'draft');
  assert.equal(page.visibility, 'private');
  assert.equal(page.createdFrom.label, entry.ledgerKey);
  assert.match(JSON.stringify(page.body), /Private research operating ledger/);
});

const clone = value => JSON.parse(JSON.stringify(value));

const transactionalHarness = () => {
  const state = { page: null, receipts: new Map(), revisions: [] };
  let lock = Promise.resolve();
  let pageSequence = 0;
  let revisionSequence = 0;
  let failFinalization = 0;
  let nullRevision = 0;
  const sessionObservations = [];
  const slugCalls = [];

  const makePage = raw => ({
    ...clone(raw),
    markModified() {},
    async save(options = {}) {
      sessionObservations.push(options.session || null);
      state.page = this;
      return this;
    }
  });

  const restore = snapshot => {
    state.page = snapshot.page ? makePage(snapshot.page) : null;
    state.receipts = new Map(snapshot.receipts.map(([key, value]) => [key, clone(value)]));
    state.revisions = clone(snapshot.revisions);
  };

  const WikiPage = {
    db: {
      async startSession() {
        const session = {
          async withTransaction(callback) {
            const prior = lock;
            let unlock;
            lock = new Promise(resolve => { unlock = resolve; });
            await prior;
            const snapshot = {
              page: state.page ? clone(state.page) : null,
              receipts: Array.from(state.receipts.entries()).map(([key, value]) => [key, clone(value)]),
              revisions: clone(state.revisions)
            };
            try {
              return await callback();
            } catch (error) {
              restore(snapshot);
              throw error;
            } finally {
              unlock();
            }
          },
          async endSession() {}
        };
        return session;
      }
    },
    async findOne() { return state.page; },
    async create(rows, options = {}) {
      sessionObservations.push(options.session || null);
      const page = makePage({ _id: `ledger-page-${++pageSequence}`, ...rows[0] });
      state.page = page;
      return [page];
    }
  };

  const NoeisReceipt = {
    async findOne(query) { return state.receipts.get(query.receiptId) || null; },
    async create(rows, options = {}) {
      sessionObservations.push(options.session || null);
      const row = clone(rows[0]);
      if (state.receipts.has(row.receiptId)) {
        const error = new Error('duplicate receipt');
        error.code = 11000;
        throw error;
      }
      state.receipts.set(row.receiptId, row);
      return [row];
    },
    async findOneAndUpdate(query, update, options = {}) {
      sessionObservations.push(options.session || null);
      if (failFinalization > 0) {
        failFinalization -= 1;
        throw new Error('receipt finalization unavailable');
      }
      const row = { ...(state.receipts.get(query.receiptId) || {}), ...clone(update.$set) };
      state.receipts.set(query.receiptId, row);
      return row;
    }
  };

  const createWikiRevision = async ({ session, sourceVersion }) => {
    sessionObservations.push(session || null);
    if (nullRevision > 0) {
      nullRevision -= 1;
      return null;
    }
    const revision = { _id: `revision-ledger-${++revisionSequence}`, sourceVersion };
    state.revisions.push(revision);
    return revision;
  };

  const run = input => persistResearchLedgerEntry({
    ...baseInput(),
    ...input,
    WikiPage,
    WikiRevision: {},
    NoeisReceipt,
    userId: 'user-1',
    buildUniqueSlug: async (...args) => {
      slugCalls.push(args);
      return 'living-thesis-001-research-ledger-2026-07';
    },
    createWikiRevision
  });

  return {
    run,
    state,
    sessionObservations,
    slugCalls,
    seedReceipt(receipt) { state.receipts.set(receipt.receiptId, clone(receipt)); },
    failNextFinalization() { failFinalization += 1; },
    returnNullRevisionOnce() { nullRevision += 1; }
  };
};

test('atomic ledger transaction creates one private page, revision, and committed receipt', async () => {
  const harness = transactionalHarness();
  const result = await harness.run({});
  assert.equal(result.created, true);
  assert.equal(result.idempotent, false);
  assert.equal(result.page.visibility, 'private');
  assert.equal(harness.state.revisions.length, 1);
  assert.equal(harness.state.revisions[0].sourceVersion, result.entry.receiptId);
  assert.equal(harness.state.receipts.get(result.entry.receiptId).provenance.persistenceState, 'committed');
  assert.ok(harness.sessionObservations.length >= 4);
  assert.ok(harness.sessionObservations.every(Boolean));
  assert.equal(harness.slugCalls.length, 1);
  assert.equal(harness.slugCalls[0][0], 'user-1');
  assert.equal(harness.slugCalls[0][2], null);
  assert.ok(harness.slugCalls[0][3].session);
});

test('legacy in-progress receipt with persisted page and revision evidence remains idempotent', async () => {
  const harness = transactionalHarness();
  const entry = buildResearchLedgerEntry(baseInput());
  harness.seedReceipt({
    userId: 'user-1',
    receiptId: entry.receiptId,
    kind: 'research_operating_ledger_entry',
    status: 'in_progress',
    provenance: { ...entry, payloadDigest: undefined, ledgerPageId: 'legacy-page', revisionId: 'legacy-revision' }
  });
  const result = await harness.run({});
  assert.equal(result.idempotent, true);
  assert.equal(harness.state.receipts.size, 1);
  assert.equal(harness.state.revisions.length, 0);
});

test('exact semantic retry returns the stored entry and ignores retry time', async () => {
  const harness = transactionalHarness();
  const first = await harness.run({ entryKey: 'frame-week-1' });
  const retry = await harness.run({
    entryKey: 'frame-week-1',
    thesisTitle: 'Renamed living thesis',
    recordedAt: '2026-07-21T18:00:00.000Z'
  });
  assert.equal(retry.idempotent, true);
  assert.equal(retry.entry.recordedAt, first.entry.recordedAt);
  assert.equal(retry.entry.summary, first.entry.summary);
  assert.equal(retry.entry.thesisTitle, first.entry.thesisTitle);
  assert.equal(harness.state.revisions.length, 1);
  assert.equal(harness.state.receipts.size, 1);
});

test('same idempotency key with changed semantic content fails closed', async () => {
  const harness = transactionalHarness();
  await harness.run({});
  await assert.rejects(
    () => harness.run({ summary: 'Changed content that was never persisted.' }),
    error => error.code === 'RESEARCH_LEDGER_IDEMPOTENCY_CONFLICT'
  );
  assert.equal(harness.state.revisions.length, 1);
  assert.equal(harness.state.receipts.size, 1);
  assert.equal((harness.state.page.plainText.match(/Changed content/g) || []).length, 0);
});

test('stored digest is recomputed and corrupted receipt provenance fails closed', async () => {
  const harness = transactionalHarness();
  const first = await harness.run({ entryKey: 'frame-integrity' });
  const stored = harness.state.receipts.get(first.entry.receiptId);
  stored.provenance.summary = 'CORRUPTED-STORED-SUMMARY';
  await assert.rejects(
    () => harness.run({ entryKey: 'frame-integrity' }),
    error => error.code === 'RESEARCH_LEDGER_RECEIPT_INTEGRITY'
  );
  assert.equal(harness.state.revisions.length, 1);
});

test('receipt failure aborts page and revision, then retry records the entry exactly once', async () => {
  const harness = transactionalHarness();
  harness.failNextFinalization();
  await assert.rejects(() => harness.run({}), /receipt finalization unavailable/);
  assert.equal(harness.state.page, null);
  assert.equal(harness.state.revisions.length, 0);
  assert.equal(harness.state.receipts.size, 0);

  const retry = await harness.run({});
  assert.equal(retry.idempotent, false);
  assert.equal(harness.state.revisions.length, 1);
  assert.equal(harness.state.receipts.size, 1);
  assert.equal((harness.state.page.plainText.match(/Recorded the research frame/g) || []).length, 1);
});

test('null revision aborts every ledger write and retry remains clean', async () => {
  const harness = transactionalHarness();
  harness.returnNullRevisionOnce();
  await assert.rejects(() => harness.run({}), /revision creation failed/);
  assert.equal(harness.state.page, null);
  assert.equal(harness.state.revisions.length, 0);
  assert.equal(harness.state.receipts.size, 0);
  await harness.run({});
  assert.equal(harness.state.revisions.length, 1);
  assert.equal(harness.state.receipts.size, 1);
});

test('two concurrent calls for the same entry produce one body entry, revision, and receipt', async () => {
  const harness = transactionalHarness();
  const results = await Promise.all([harness.run({}), harness.run({})]);
  assert.deepEqual(results.map(result => result.idempotent).sort(), [false, true]);
  assert.equal(harness.state.revisions.length, 1);
  assert.equal(harness.state.receipts.size, 1);
  assert.equal((harness.state.page.plainText.match(/Recorded the research frame/g) || []).length, 1);
});

test('concurrent distinct entries preserve both exactly once on one monthly ledger page', async () => {
  const harness = transactionalHarness();
  await Promise.all([
    harness.run({}),
    harness.run({
      phase: 'evidence',
      entryKey: 'evidence:2026-07-22',
      summary: 'Connected bounded evidence without accepting a claim.',
      evidencePageIds: ['evidence-1']
    })
  ]);
  assert.equal(harness.state.revisions.length, 2);
  assert.equal(harness.state.receipts.size, 2);
  assert.match(harness.state.page.plainText, /Recorded the research frame/);
  assert.match(harness.state.page.plainText, /Connected bounded evidence/);
  assert.equal((harness.state.page.plainText.match(/Recorded the research frame/g) || []).length, 1);
  assert.equal((harness.state.page.plainText.match(/Connected bounded evidence/g) || []).length, 1);
});

test('ledger fails before mutation when MongoDB transactions are unavailable', async () => {
  await assert.rejects(() => persistResearchLedgerEntry({
    ...baseInput(),
    WikiPage: {},
    WikiRevision: {},
    NoeisReceipt: {},
    userId: 'user-1'
  }), /requires MongoDB transaction support/);
});
