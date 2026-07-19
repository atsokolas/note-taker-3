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

test('initial ledger page is a private canonical Wiki log, not a parallel thesis object', () => {
  const entry = buildResearchLedgerEntry(baseInput());
  const page = initialLedgerPage(entry);
  assert.equal(page.pageType, 'log');
  assert.equal(page.status, 'draft');
  assert.equal(page.visibility, 'private');
  assert.equal(page.createdFrom.label, entry.ledgerKey);
  assert.match(JSON.stringify(page.body), /Private research operating ledger/);
});

test('persistResearchLedgerEntry creates WikiPage, revision, and receipt using existing primitives', async () => {
  const createdPages = [];
  const storedReceipts = [];
  const WikiPage = {
    findOne: async () => null,
    create: async input => {
      const page = { _id: 'ledger-page-1', ...input };
      createdPages.push(page);
      return page;
    }
  };
  const NoeisReceipt = { findOne: () => ({ lean: async () => null }) };
  const result = await persistResearchLedgerEntry({
    ...baseInput(),
    WikiPage,
    WikiRevision: {},
    NoeisReceipt,
    userId: 'user-1',
    buildUniqueSlug: async () => 'living-thesis-001-research-ledger-2026-07',
    createWikiRevision: async input => ({ _id: 'revision-ledger-1', ...input }),
    persistNoeisReceipt: async ({ receipt }) => {
      storedReceipts.push(receipt);
      return receipt;
    }
  });
  assert.equal(result.created, true);
  assert.equal(result.idempotent, false);
  assert.equal(createdPages.length, 1);
  assert.equal(result.page.visibility, 'private');
  assert.equal(result.revision._id, 'revision-ledger-1');
  assert.equal(storedReceipts[0].kind, 'research_operating_ledger_entry');
  assert.equal(storedReceipts[0].provenance.revisionId, 'revision-ledger-1');
  assert.deepEqual(storedReceipts[0].touched.map(row => row.id), ['ledger-page-1', 'thesis-001']);
});

test('same ledger entry receipt is idempotent and does not append the page twice', async () => {
  let findPageCalls = 0;
  let createPageCalls = 0;
  const existingReceipt = { receiptId: 'research-ledger:2026-07:thesis-001:frame:2026-07-20' };
  const result = await persistResearchLedgerEntry({
    ...baseInput(),
    WikiPage: {
      findOne: async () => { findPageCalls += 1; return null; },
      create: async () => { createPageCalls += 1; return null; }
    },
    NoeisReceipt: { findOne: () => ({ lean: async () => existingReceipt }) },
    userId: 'user-1'
  });
  assert.equal(result.idempotent, true);
  assert.equal(findPageCalls, 0);
  assert.equal(createPageCalls, 0);
});

test('subsequent phase appends to the same private ledger and deduplicates evidence page references', async () => {
  let saved = 0;
  const existingPage = {
    _id: 'ledger-page-1',
    title: 'Existing ledger',
    status: 'draft',
    visibility: 'private',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Existing entry' }] }] },
    sourceRefs: [{ type: 'wiki_page', objectId: 'evidence-1' }],
    markModified: () => {},
    save: async () => { saved += 1; }
  };
  const result = await persistResearchLedgerEntry({
    ...baseInput(),
    phase: 'evidence',
    summary: 'Connected bounded evidence without accepting or rewriting a thesis claim.',
    evidencePageIds: ['evidence-1', 'evidence-2'],
    WikiPage: { findOne: async () => existingPage },
    WikiRevision: {},
    NoeisReceipt: { findOne: () => ({ lean: async () => null }) },
    userId: 'user-1',
    createWikiRevision: async () => ({ _id: 'revision-ledger-2' }),
    persistNoeisReceipt: async ({ receipt }) => receipt
  });
  assert.equal(result.created, false);
  assert.equal(saved, 1);
  assert.equal(existingPage.visibility, 'private');
  assert.deepEqual(existingPage.sourceRefs.map(row => row.objectId), ['evidence-1', 'evidence-2']);
  assert.match(existingPage.plainText, /Connected bounded evidence/);
});
