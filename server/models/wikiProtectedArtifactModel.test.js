const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { WikiPage } = require('./index');

const base = {
  userId: new mongoose.Types.ObjectId(),
  title: 'Living Thesis 001 — Research Ledger — 2026-07',
  slug: 'living-thesis-001-research-ledger-2026-07',
  pageType: 'log',
  status: 'draft',
  createdFrom: { type: 'wiki_index', label: 'research-ledger:2026-07:thesis-001' }
};

const privateLedger = new WikiPage({ ...base, visibility: 'private' });
assert.equal(privateLedger.validateSync(), undefined);

const sharedLedger = new WikiPage({ ...base, visibility: 'shared' });
const error = sharedLedger.validateSync();
assert.ok(error?.errors?.visibility);
assert.match(error.errors.visibility.message, /permanently private/);

console.log('wiki protected artifact model tests passed');
