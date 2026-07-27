const test = require('node:test');
const assert = require('node:assert/strict');

const { ISSUE_INPUT, ensureIssueLibraryItems } = require('./create_this_week_in_ai_issue_001');
const { buildWeekendReadingsDraft, createWeekendReadingsDraft } = require('../server/services/weekendReadingsService');
const { buildApprovalCandidate } = require('../server/services/weekendReadingsApprovalService');

test('Issue 001 is a bounded private source-backed wiki without dossier semantics', () => {
  const draft = buildWeekendReadingsDraft({ ...ISSUE_INPUT, ownerId: 'owner-1' });
  assert.equal(draft.title, 'This Week in AI — 2026-07-26 — Issue 001');
  assert.equal(draft.editionKey, 'this-week-in-ai:owner-1:2026-07-20:2026-07-26');
  assert.equal(draft.page.status, 'draft');
  assert.equal(draft.page.visibility, 'private');
  assert.equal(draft.items.length, 4);
  assert.equal(new Set(draft.items.map(item => item.canonicalUrl)).size, 4);
  assert.ok(draft.items.every(item => item.sourceQuality === 'primary'));
  assert.ok(draft.items.every(item => item.technicalApproach && item.evidenceAssessment && item.consequence && item.boundary));
  assert.match(draft.plainText, /In brief/);
  assert.match(draft.plainText, /At a glance/);
  assert.match(draft.plainText, /Connections across the week/);
  assert.match(draft.plainText, /What to watch next/);
  assert.doesNotMatch(draft.plainText, /Governing question|This week.s judgment|Prior belief|Updated belief|Strongest counterargument|Maintained-object updates/);
});

test('This Week in AI fails closed outside the two-to-five item editorial bound', () => {
  assert.throws(
    () => buildWeekendReadingsDraft({ ...ISSUE_INPUT, items: [ISSUE_INPUT.items[0]], ownerId: 'owner-1' }),
    /requires 2-5 selected items/
  );
  assert.throws(
    () => buildWeekendReadingsDraft({
      ...ISSUE_INPUT,
      ownerId: 'owner-1',
      items: [...ISSUE_INPUT.items, { ...ISSUE_INPUT.items[0], title: 'Fifth', url: 'https://arxiv.org/abs/2607.00001' }, { ...ISSUE_INPUT.items[1], title: 'Sixth', url: 'https://arxiv.org/abs/2607.00002' }]
    }),
    /requires 2-5 selected items/
  );
});

test('approval reconstruction preserves the exact This Week in AI profile without private routing metadata', () => {
  const draft = buildWeekendReadingsDraft({ ...ISSUE_INPUT, ownerId: 'owner-1' });
  const candidate = buildApprovalCandidate({ snapshot: draft.page, revisionId: 'revision-1' });
  assert.equal(candidate.artifactType, 'this_week_in_ai');
  assert.equal(candidate.publicationProfile, 'this_week_in_ai');
  assert.equal(candidate.sourceRefs.length, 4);
  assert.match(candidate.plainText, /Connections across the week/);
  assert.doesNotMatch(JSON.stringify(candidate), /activeThesisPageId|affectedClaimIds|intakeProvenance/);
});

test('Issue 001 can replace only its existing private draft and records a new revision', async () => {
  let saved = 0;
  const existingPage = {
    _id: 'page-1',
    userId: 'owner-1',
    slug: 'this-week-in-ai-2026-07-26-issue-001',
    title: 'Old dossier-shaped issue',
    status: 'draft',
    visibility: 'private',
    createdFrom: { label: 'this-week-in-ai:owner-1:2026-07-20:2026-07-26' },
    toObject() { return { ...this, toObject: undefined, save: undefined }; },
    async save() { saved += 1; return this; }
  };
  const revisions = [];
  const result = await createWeekendReadingsDraft({
    ...ISSUE_INPUT,
    replaceExistingDraft: true,
    WikiPage: { findOne: () => ({ lean: async () => existingPage }) },
    WikiRevision: {},
    NoeisReceipt: {
      find: () => ({ lean: async () => [] }),
      findOneAndUpdate: async () => null
    },
    userId: 'owner-1',
    createWikiRevision: async input => {
      revisions.push(input);
      return { _id: 'revision-2' };
    },
    persistNoeisReceipt: async ({ receipt }) => receipt
  });

  assert.equal(result.created, false);
  assert.equal(result.updated, true);
  assert.equal(saved, 1);
  assert.equal(revisions[0].reason, 'user_edit');
  assert.match(existingPage.plainText, /Connections across the week/);
  assert.doesNotMatch(existingPage.plainText, /Strongest counterargument|Maintained-object updates/);
});

test('Issue 001 resolves every paper through the Library before Wiki creation', async () => {
  const created = [];
  const existing = { _id: 'article-existing', url: ISSUE_INPUT.items[0].url };
  const ArticleModel = {
    findOne: async ({ url }) => url === existing.url ? existing : null,
    create: async input => {
      const article = { _id: `article-${created.length + 1}`, ...input };
      created.push(article);
      return article;
    }
  };

  const items = await ensureIssueLibraryItems({ ArticleModel, userId: 'owner-1' });
  const draft = buildWeekendReadingsDraft({ ...ISSUE_INPUT, items, ownerId: 'owner-1' });

  assert.equal(items.length, 4);
  assert.equal(created.length, 3);
  assert.ok(items.every(item => item.libraryArticleId));
  assert.ok(draft.page.sourceRefs.every(source => source.type === 'article' && source.objectId));
  assert.equal(created[0].importMeta.provider, 'this_week_in_ai');
  assert.match(created[0].content, /Finding:|How it works:|Limitations:/);
});
