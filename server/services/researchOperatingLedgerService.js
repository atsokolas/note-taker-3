const { createWikiRevision: defaultCreateWikiRevision } = require('./wikiRevisionService');
const { persistNoeisReceipt: defaultPersistNoeisReceipt } = require('./noeisReceiptService');

const LEDGER_PHASES = new Set(['frame', 'evidence', 'critic', 'decision', 'postmortem', 'quarterly_calibration']);
const LEDGER_STATUSES = new Set(['planned', 'in_progress', 'completed', 'deferred', 'no_material_change']);
const MONTHLY_OUTPUT_TYPES = new Set([
  'not_yet_determined',
  'complete_thesis',
  'substantial_chapter',
  'material_change_note',
  'preserved_judgment_note'
]);

const clean = (value = '', limit = 4000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const idOf = value => clean(value?._id || value?.id || value, 160);
const uniqueStrings = (value = [], limit = 40) => Array.from(new Set(
  (Array.isArray(value) ? value : []).map(item => clean(item, 800)).filter(Boolean)
)).slice(0, limit);

const normalizeMonth = (value = '') => {
  const month = clean(value, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('month must use YYYY-MM.');
  return month;
};

const normalizeDate = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('recordedAt must be a valid date.');
  return date;
};

const normalizeDispositions = (value = []) => (Array.isArray(value) ? value : []).map((row = {}) => ({
  subjectId: clean(row.subjectId, 160),
  disposition: clean(row.disposition, 120),
  reason: clean(row.reason, 1200)
})).filter(row => row.subjectId && row.disposition).slice(0, 40);

const buildResearchLedgerEntry = ({
  thesisPageId,
  thesisTitle = 'Industrial Electrification Value Stack — Living Thesis 001',
  month,
  phase,
  status = 'in_progress',
  summary,
  priorOrDecision = '',
  unknowns = [],
  evidencePageIds = [],
  dispositions = [],
  friction = [],
  outputType = 'not_yet_determined',
  nextAction = '',
  recordedAt = new Date(),
  entryKey = ''
} = {}) => {
  const resolvedThesisPageId = idOf(thesisPageId);
  if (!resolvedThesisPageId) throw new Error('thesisPageId is required.');
  const resolvedMonth = normalizeMonth(month);
  const resolvedPhase = clean(phase, 80);
  const resolvedStatus = clean(status, 80);
  const resolvedOutputType = clean(outputType, 80) || 'not_yet_determined';
  if (!LEDGER_PHASES.has(resolvedPhase)) throw new Error('phase is not a supported research-ledger phase.');
  if (!LEDGER_STATUSES.has(resolvedStatus)) throw new Error('status is not supported for a research-ledger entry.');
  if (!MONTHLY_OUTPUT_TYPES.has(resolvedOutputType)) throw new Error('outputType is not a supported monthly outcome.');
  const resolvedSummary = clean(summary, 3000);
  if (!resolvedSummary) throw new Error('summary is required.');
  const at = normalizeDate(recordedAt);
  const ledgerKey = `research-ledger:${resolvedMonth}:${resolvedThesisPageId}`;
  const resolvedEntryKey = clean(entryKey, 240) || `${resolvedPhase}:${at.toISOString().slice(0, 10)}`;
  return {
    ledgerKey,
    entryKey: resolvedEntryKey,
    receiptId: `${ledgerKey}:${resolvedEntryKey}`,
    thesisPageId: resolvedThesisPageId,
    thesisTitle: clean(thesisTitle, 240) || 'Living Thesis',
    month: resolvedMonth,
    phase: resolvedPhase,
    status: resolvedStatus,
    summary: resolvedSummary,
    priorOrDecision: clean(priorOrDecision, 2400),
    unknowns: uniqueStrings(unknowns),
    evidencePageIds: uniqueStrings((Array.isArray(evidencePageIds) ? evidencePageIds : []).map(idOf), 80),
    dispositions: normalizeDispositions(dispositions),
    friction: uniqueStrings(friction),
    outputType: resolvedOutputType,
    nextAction: clean(nextAction, 1200),
    recordedAt: at.toISOString()
  };
};

const textNode = text => ({ type: 'text', text });
const paragraph = text => ({ type: 'paragraph', content: [textNode(text)] });
const heading = (level, text) => ({ type: 'heading', attrs: { level }, content: [textNode(text)] });

const phaseLabel = value => ({
  frame: 'Week 1 — Frame, prior, decision, and unknowns',
  evidence: 'Week 2 — Bounded evidence and claim connections',
  critic: 'Week 3 — Critic, red team, and human dispositions',
  decision: 'Week 4 — Decision and public-safe artifact',
  postmortem: 'Month end — Research and product-friction postmortem',
  quarterly_calibration: 'Quarter end — Calibration and workflow review'
}[value] || value);

const entryNodes = entry => [
  heading(2, `${phaseLabel(entry.phase)} · ${entry.recordedAt.slice(0, 10)}`),
  paragraph(`Status: ${entry.status.replace(/_/g, ' ')} · Monthly output: ${entry.outputType.replace(/_/g, ' ')}`),
  paragraph(entry.summary),
  ...(entry.priorOrDecision ? [paragraph(`Prior or decision: ${entry.priorOrDecision}`)] : []),
  ...(entry.unknowns.length ? [paragraph(`Unknowns: ${entry.unknowns.join(' | ')}`)] : []),
  ...(entry.dispositions.length ? [paragraph(`Human dispositions: ${entry.dispositions.map(row => `${row.subjectId} — ${row.disposition}${row.reason ? ` (${row.reason})` : ''}`).join(' | ')}`)] : []),
  ...(entry.friction.length ? [paragraph(`Observed friction: ${entry.friction.join(' | ')}`)] : []),
  ...(entry.nextAction ? [paragraph(`Next action: ${entry.nextAction}`)] : [])
];

const initialLedgerPage = entry => ({
  title: `${entry.thesisTitle} — Research Ledger — ${entry.month}`,
  pageType: 'log',
  status: 'draft',
  visibility: 'private',
  sourceScope: 'selected_sources',
  createdFrom: {
    type: 'wiki_index',
    label: entry.ledgerKey,
    text: `Private operating ledger for ${entry.thesisTitle}, ${entry.month}.`
  },
  body: {
    type: 'doc',
    content: [
      paragraph('Private research operating ledger — not a public artifact.'),
      paragraph(`Maintained thesis: ${entry.thesisTitle}`),
      ...entryNodes(entry)
    ]
  },
  plainText: '',
  sourceRefs: entry.evidencePageIds.map((pageId, index) => ({
    type: 'wiki_page',
    objectId: pageId,
    title: `Evidence page ${index + 1}`,
    snippet: `Connected during the ${entry.phase} phase.`,
    addedBy: 'user',
    metadata: { researchLedger: { entryKey: entry.entryKey, phase: entry.phase } }
  }))
});

const bodyPlainText = body => (Array.isArray(body?.content) ? body.content : [])
  .flatMap(node => Array.isArray(node?.content) ? node.content : [])
  .map(node => clean(node?.text, 8000))
  .filter(Boolean)
  .join('\n');

const resolveQuery = async query => {
  if (!query) return null;
  if (typeof query.lean === 'function') return query.lean();
  return query;
};

const queryInSession = (query, session) => (
  query && session && typeof query.session === 'function' ? query.session(session) : query
);

const rawReceipt = receipt => (receipt?.toObject ? receipt.toObject({ virtuals: false }) : receipt);
const isCommittedLedgerReceipt = (receipt = {}) => {
  const raw = rawReceipt(receipt) || {};
  if (raw.provenance?.persistenceState === 'reserved') return false;
  if (raw.provenance?.persistenceState === 'committed') return true;
  return raw.kind === 'research_operating_ledger_entry'
    && Boolean(raw.provenance?.ledgerPageId)
    && Boolean(raw.provenance?.revisionId);
};

const reservationDocument = ({ entry, userId }) => ({
  userId,
  receiptId: entry.receiptId,
  kind: 'research_operating_ledger_entry',
  source: 'noeis',
  sourceLabel: 'Research operating ledger',
  status: 'in_progress',
  title: `${entry.thesisTitle} — ${phaseLabel(entry.phase)}`,
  summary: 'Atomic ledger-entry reservation; not a completed research receipt.',
  provenance: {
    persistenceState: 'reserved',
    ledgerKey: entry.ledgerKey,
    entryKey: entry.entryKey
  },
  completedAt: new Date(entry.recordedAt)
});

const persistResearchLedgerEntry = async ({
  WikiPage,
  WikiRevision,
  NoeisReceipt,
  userId,
  buildUniqueSlug,
  createWikiRevision = defaultCreateWikiRevision,
  persistNoeisReceipt = defaultPersistNoeisReceipt,
  ...input
} = {}) => {
  if (!WikiPage || !NoeisReceipt || !userId) throw new Error('WikiPage, NoeisReceipt, and userId are required.');
  if (!WikiRevision) throw new Error('WikiRevision is required for atomic research-ledger persistence.');
  if (typeof WikiPage?.db?.startSession !== 'function') {
    throw new Error('Research-ledger persistence requires MongoDB transaction support.');
  }
  const entry = buildResearchLedgerEntry(input);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await WikiPage.db.startSession();
    let outcome = null;
    try {
      await session.withTransaction(async () => {
        const existingReceipt = typeof NoeisReceipt.findOne === 'function'
          ? await resolveQuery(queryInSession(NoeisReceipt.findOne({ userId, receiptId: entry.receiptId }), session))
          : null;
        if (existingReceipt) {
          if (!isCommittedLedgerReceipt(existingReceipt)) throw new Error('Research-ledger receipt reservation is incomplete.');
          outcome = { created: false, idempotent: true, page: null, revision: null, receipt: existingReceipt, entry };
          return;
        }

        const reserved = await NoeisReceipt.create([reservationDocument({ entry, userId })], { session });
        if (!Array.isArray(reserved) || !reserved[0]) throw new Error('Research-ledger receipt reservation failed.');

        let page = typeof WikiPage.findOne === 'function'
          ? await queryInSession(WikiPage.findOne({ userId, 'createdFrom.label': entry.ledgerKey, status: { $ne: 'archived' } }), session)
          : null;
        const pageWasCreated = !page;
        if (!page) {
          const pageInput = initialLedgerPage(entry);
          pageInput.userId = userId;
          pageInput.slug = typeof buildUniqueSlug === 'function'
            ? await buildUniqueSlug(userId, pageInput.title, null, { session })
            : pageInput.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
          pageInput.plainText = bodyPlainText(pageInput.body);
          const createdPages = await WikiPage.create([pageInput], { session });
          page = Array.isArray(createdPages) ? createdPages[0] : createdPages;
          if (!page) throw new Error('Research-ledger page creation failed.');
        } else {
          const rawBody = page.body?.toObject ? page.body.toObject() : page.body;
          page.body = {
            type: 'doc',
            content: [...(Array.isArray(rawBody?.content) ? rawBody.content : []), ...entryNodes(entry)]
          };
          page.plainText = bodyPlainText(page.body);
          page.visibility = 'private';
          page.status = 'draft';
          if (entry.evidencePageIds.length) {
            const existingIds = new Set((Array.isArray(page.sourceRefs) ? page.sourceRefs : []).map(ref => idOf(ref.objectId)));
            const additions = entry.evidencePageIds.filter(pageId => !existingIds.has(pageId)).map((pageId, index) => ({
              type: 'wiki_page',
              objectId: pageId,
              title: `Evidence page ${(Array.isArray(page.sourceRefs) ? page.sourceRefs.length : 0) + index + 1}`,
              snippet: `Connected during the ${entry.phase} phase.`,
              addedBy: 'user',
              metadata: { researchLedger: { entryKey: entry.entryKey, phase: entry.phase } }
            }));
            page.sourceRefs = [...(Array.isArray(page.sourceRefs) ? page.sourceRefs : []), ...additions];
          }
          if (typeof page.markModified === 'function') {
            page.markModified('body');
            page.markModified('sourceRefs');
          }
          await page.save({ session });
        }

        const revision = await createWikiRevision({
          WikiRevision,
          userId,
          page,
          reason: pageWasCreated ? 'created' : 'user_edit',
          actorType: 'user',
          sourceVersion: entry.receiptId,
          summary: `${phaseLabel(entry.phase)} ledger entry recorded for ${entry.month}.`,
          session
        });
        if (!revision) throw new Error('Research-ledger revision creation failed.');
        const pageId = idOf(page);
        const revisionId = idOf(revision);
        const receipt = await persistNoeisReceipt({
          NoeisReceipt,
          userId,
          session,
          receipt: {
            id: entry.receiptId,
            kind: 'research_operating_ledger_entry',
            source: 'noeis',
            sourceLabel: 'Research operating ledger',
            status: entry.status,
            title: `${entry.thesisTitle} — ${phaseLabel(entry.phase)}`,
            summary: entry.summary,
            metrics: { evidencePageCount: entry.evidencePageIds.length, dispositionCount: entry.dispositions.length, frictionCount: entry.friction.length },
            touched: [
              { type: 'wiki_page', id: pageId, title: page.title },
              { type: 'wiki_page', id: entry.thesisPageId, title: entry.thesisTitle }
            ],
            nextAction: entry.nextAction ? { type: 'research_next_action', label: entry.nextAction, targetId: entry.thesisPageId } : null,
            provenance: { ...entry, ledgerPageId: pageId, revisionId, persistenceState: 'committed' },
            completedAt: entry.recordedAt
          }
        });
        if (!receipt) throw new Error('Research-ledger receipt finalization failed.');
        outcome = { created: pageWasCreated, idempotent: false, page, revision, receipt, entry };
      });
      if (!outcome) throw new Error('Research-ledger transaction completed without an outcome.');
      return outcome;
    } catch (error) {
      if (error?.code !== 11000 || attempt === 2) throw error;
      const committed = typeof NoeisReceipt.findOne === 'function'
        ? await resolveQuery(NoeisReceipt.findOne({ userId, receiptId: entry.receiptId }))
        : null;
      if (committed && isCommittedLedgerReceipt(committed)) {
        return { created: false, idempotent: true, page: null, revision: null, receipt: committed, entry };
      }
    } finally {
      await session.endSession();
    }
  }
  throw new Error('Research-ledger transaction could not be completed.');
};

module.exports = {
  LEDGER_PHASES,
  LEDGER_STATUSES,
  MONTHLY_OUTPUT_TYPES,
  buildResearchLedgerEntry,
  initialLedgerPage,
  persistResearchLedgerEntry
};
