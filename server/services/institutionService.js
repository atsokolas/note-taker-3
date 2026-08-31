/**
 * Persist the Stage 6 institution: lineage, stress sheets, watches,
 * decision-memory events, holds, and portable exports. Claims stay on
 * each author's page. Nothing here is a belief engine.
 */

const { persistNoeisReceipt, serializeStoredReceipt } = require('./noeisReceiptService');
const { adapterOf, projectChain } = require('./domainAdapter');
const {
  CrossCaseLineageError,
  acceptLink,
  proposeLink,
  rejectLink,
  serializeThread
} = require('./crossCaseLineage');
const { assertPrivate, buildCalibration } = require('./calibrationInstrument');
const {
  WorldModelStressError,
  choosePosture,
  draftScenario,
  serializeOverlay
} = require('./worldModelStress');
const {
  GovernedResearchError,
  acceptProposal,
  killWatch,
  openMandate,
  proposeFromWatch,
  reverseProposal,
  serializeWatch
} = require('./governedResearch');
const {
  DecisionMemoryError,
  SCHEMA_VERSION,
  idempotencyKey,
  project,
  replayAudit,
  withinBudget
} = require('./decisionMemory');
const {
  PortabilityError,
  correctCase,
  exportBundle,
  forgetCase,
  isHeld,
  placeHold,
  transferOwnership,
  validateImport
} = require('./institutionalPortability');
const { can, seatFor } = require('./livingTeam');

class InstitutionError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'InstitutionError';
    this.status = status;
    this.code = code;
  }
}

const wrap = (error) => {
  if (
    error instanceof InstitutionError
    || error instanceof CrossCaseLineageError
    || error instanceof WorldModelStressError
    || error instanceof GovernedResearchError
    || error instanceof DecisionMemoryError
    || error instanceof PortabilityError
  ) {
    if (!error.status) error.status = 400;
    return error;
  }
  return error;
};

const clean = (value = '', limit = 400) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const id = (value) => String(value?._id || value?.id || value || '').trim();
const plain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const list = (value) => (Array.isArray(value) ? value : []);
const resolveQuery = (query) => (query?.then ? query : Promise.resolve(query));

const loadPage = async (WikiPage, pageId, userId) => {
  if (!pageId || !WikiPage?.findOne) return null;
  let query = WikiPage.findOne({ _id: pageId, status: { $ne: 'archived' } });
  if (query?.lean) query = query.lean();
  const page = await resolveQuery(query);
  if (!page) return null;
  if (userId && id(page.userId) !== id(userId)) return null;
  return page;
};

const persistReceipt = async ({
  NoeisReceipt, userId, kind, title, summary, page, requestId, action, extra = {}
}) => {
  if (!NoeisReceipt) return null;
  const receipt = await persistNoeisReceipt({
    NoeisReceipt,
    userId,
    receipt: {
      id: `institution:v1:${id(page)}:${action}:${requestId || kind}`,
      kind,
      source: 'wiki',
      sourceLabel: 'Judgment',
      status: 'completed',
      completedAt: extra.at || new Date(),
      title,
      summary,
      touched: [{ type: 'wiki_page', id: id(page), title: page?.title }],
      provenance: {
        version: 1,
        action,
        pageId: id(page),
        requestId: clean(requestId, 80),
        ...extra
      }
    }
  });
  return receipt || serializeStoredReceipt(null);
};

const recordEvent = async ({
  DecisionMemoryEvent, userId, requestId, action, pageId, kind, summary, now
}) => {
  if (!DecisionMemoryEvent?.create) return null;
  const key = idempotencyKey({ userId, requestId, action, pageId });
  if (DecisionMemoryEvent.findOne) {
    const existing = await resolveQuery(DecisionMemoryEvent.findOne({ key }));
    if (existing) return { event: plain(existing), idempotent: true };
  }
  const event = await DecisionMemoryEvent.create({
    key,
    userId,
    requestId: clean(requestId, 80),
    action,
    pageId,
    kind,
    summary: clean(summary, 400),
    schemaVersion: SCHEMA_VERSION,
    at: now
  });
  return { event: plain(event), idempotent: false };
};

const requireWriteBudget = async ({ DecisionMemoryEvent, userId, now }) => {
  if (!DecisionMemoryEvent?.find) return { remaining: 60, spent: 0 };
  let query = DecisionMemoryEvent.find({
    userId,
    at: { $gte: new Date(now.getTime() - 60 * 60 * 1000) }
  });
  if (query?.lean) query = query.lean();
  const writes = await resolveQuery(query);
  return withinBudget(list(writes), { now });
};

const readAdapter = async ({ WikiPage, userId, pageId } = {}) => {
  const page = await loadPage(WikiPage, pageId, userId);
  if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
  const adapter = adapterOf(page.judgment?.adapterId || 'held-sentence');
  return { adapter, projection: projectChain(page, adapter) };
};

const listLinks = async (CrossCaseLink, { userId, pageId }) => {
  if (!CrossCaseLink?.find) return [];
  let query = CrossCaseLink.find({
    userId,
    $or: [{ fromPageId: pageId }, { toPageId: pageId }]
  });
  if (query?.lean) query = query.lean();
  return list(await resolveQuery(query));
};

const pagesForLinks = async (WikiPage, links, userId) => {
  const ids = new Set();
  list(links).forEach((link) => {
    if (id(link.fromPageId)) ids.add(id(link.fromPageId));
    if (id(link.toPageId)) ids.add(id(link.toPageId));
  });
  if (!ids.size || !WikiPage?.find) return {};
  let query = WikiPage.find({ _id: { $in: [...ids] }, userId, status: { $ne: 'archived' } });
  if (query?.lean) query = query.lean();
  const rows = await resolveQuery(query);
  const map = {};
  list(rows).forEach((page) => {
    map[id(page)] = page;
  });
  return map;
};

const readLineage = async ({ WikiPage, CrossCaseLink, userId, pageId } = {}) => {
  const page = await loadPage(WikiPage, pageId, userId);
  if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
  const links = await listLinks(CrossCaseLink, { userId, pageId: id(page) });
  const pages = await pagesForLinks(WikiPage, links, userId);
  pages[id(page)] = page;
  return { page, thread: serializeThread(links.map(plain), pages) };
};

const proposeLineage = async ({
  WikiPage, CrossCaseLink, NoeisReceipt, DecisionMemoryEvent,
  userId, pageId, toPageId, kind, object, direction, contradiction, requestId = '', now = () => new Date()
} = {}) => {
  try {
    const actedAt = now();
    await requireWriteBudget({ DecisionMemoryEvent, userId, now: actedAt });
    const from = await loadPage(WikiPage, pageId, userId);
    const to = await loadPage(WikiPage, toPageId, userId);
    if (!from || !to) throw new InstitutionError('Both cases must be yours to thread.', 404, 'not_found');
    const drafted = proposeLink({
      fromPageId: id(from),
      toPageId: id(to),
      kind,
      object,
      direction,
      contradiction,
      proposedBy: userId,
      now: actedAt
    });
    if (requestId && CrossCaseLink?.findOne) {
      const existing = await resolveQuery(CrossCaseLink.findOne({ userId, requestId }));
      if (existing) {
        const view = await readLineage({ WikiPage, CrossCaseLink, userId, pageId });
        return { ...view, link: plain(existing), idempotent: true };
      }
    }
    const created = await CrossCaseLink.create({
      ...drafted,
      userId,
      requestId: clean(requestId, 80)
    });
    await recordEvent({
      DecisionMemoryEvent, userId, requestId, action: 'lineage.propose',
      pageId: id(from), kind: 'lineage', summary: drafted.object?.text, now: actedAt
    });
    const receipt = await persistReceipt({
      NoeisReceipt, userId, kind: 'cross_case_lineage_proposed', title: 'A thread was proposed',
      summary: drafted.object?.text, page: from, requestId, action: 'lineage.propose', extra: { at: actedAt }
    });
    const view = await readLineage({ WikiPage, CrossCaseLink, userId, pageId });
    return { ...view, link: plain(created), receipt, idempotent: false };
  } catch (error) {
    throw wrap(error);
  }
};

const rejectLineage = async ({
  WikiPage, CrossCaseLink, NoeisReceipt, DecisionMemoryEvent,
  userId, pageId, linkId, requestId = '', now = () => new Date()
} = {}) => {
  try {
    const actedAt = now();
    const page = await loadPage(WikiPage, pageId, userId);
    if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
    const row = CrossCaseLink?.findOne
      ? await resolveQuery(CrossCaseLink.findOne({ _id: linkId, userId }))
      : null;
    if (!row) throw new InstitutionError('That thread was not found.', 404, 'not_found');
    const cut = rejectLink(plain(row), { actorId: userId, now: actedAt });
    row.status = cut.status;
    row.rejectedAt = actedAt;
    row.rejectedBy = userId;
    if (row.save) await row.save();
    await recordEvent({
      DecisionMemoryEvent, userId, requestId, action: 'lineage.reject',
      pageId: id(page), kind: 'lineage', summary: cut.object?.text, now: actedAt
    });
    const receipt = await persistReceipt({
      NoeisReceipt, userId, kind: 'cross_case_lineage_rejected', title: 'A thread was cut',
      summary: cut.object?.text, page, requestId, action: 'lineage.reject', extra: { at: actedAt }
    });
    const view = await readLineage({ WikiPage, CrossCaseLink, userId, pageId });
    return { ...view, link: cut, receipt };
  } catch (error) {
    throw wrap(error);
  }
};

const acceptLineage = async ({
  WikiPage, CrossCaseLink, userId, pageId, linkId, now = () => new Date()
} = {}) => {
  const actedAt = now();
  const page = await loadPage(WikiPage, pageId, userId);
  if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
  const row = CrossCaseLink?.findOne
    ? await resolveQuery(CrossCaseLink.findOne({ _id: linkId, userId }))
    : null;
  if (!row) throw new InstitutionError('That thread was not found.', 404, 'not_found');
  const next = acceptLink(plain(row), { now: actedAt });
  row.status = next.status;
  row.acceptedAt = actedAt;
  if (row.save) await row.save();
  return readLineage({ WikiPage, CrossCaseLink, userId, pageId });
};

const readCalibration = async ({ WikiPage, userId } = {}) => {
  if (!WikiPage?.find) throw new InstitutionError('Calibration is unavailable.', 503, 'unavailable');
  let query = WikiPage.find({
    userId,
    status: { $ne: 'archived' },
    'judgment.currentJudgment': { $type: 'string', $ne: '' }
  });
  if (query?.select) query = query.select('_id userId title createdAt judgment adapterId');
  if (query?.lean) query = query.lean();
  const pages = await resolveQuery(query);
  return assertPrivate(buildCalibration(pages, { userId }), userId);
};

const readStress = async ({ WikiPage, WorldModelScenario, userId, pageId } = {}) => {
  const page = await loadPage(WikiPage, pageId, userId);
  if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
  if (!WorldModelScenario?.find) return serializeOverlay([], page);
  let query = WorldModelScenario.find({ userId, pageId: id(page) });
  if (query?.lean) query = query.lean();
  const rows = await resolveQuery(query);
  return serializeOverlay(list(rows).map(plain), page);
};

const draftStress = async ({
  WikiPage, WorldModelScenario, NoeisReceipt, userId, pageId, kind, modifiedAssumptions,
  proposedPosture, generated = true, uncertainty, requestId = '', now = () => new Date()
} = {}) => {
  try {
    const actedAt = now();
    const page = await loadPage(WikiPage, pageId, userId);
    if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
    const drafted = draftScenario({
      page, kind, modifiedAssumptions, proposedPosture, generated, uncertainty, now: actedAt
    });
    const created = await WorldModelScenario.create({
      ...drafted,
      userId,
      pageId: id(page),
      requestId: clean(requestId, 80)
    });
    const receipt = await persistReceipt({
      NoeisReceipt, userId, kind: 'world_model_stress_drafted', title: 'Tracing paper',
      summary: drafted.modifiedAssumptions.map((row) => row.to || row.from).join('; '),
      page, requestId, action: 'stress.draft', extra: { at: actedAt }
    });
    return { overlay: await readStress({ WikiPage, WorldModelScenario, userId, pageId }), scenario: plain(created), receipt };
  } catch (error) {
    throw wrap(error);
  }
};

const chooseStress = async ({
  WikiPage, WorldModelScenario, userId, pageId, scenarioId, choice, now = () => new Date()
} = {}) => {
  try {
    const actedAt = now();
    const page = await loadPage(WikiPage, pageId, userId);
    if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
    const row = WorldModelScenario?.findOne
      ? await resolveQuery(WorldModelScenario.findOne({ _id: scenarioId, userId, pageId: id(page) }))
      : null;
    if (!row) throw new InstitutionError('That sheet was not found.', 404, 'not_found');
    const next = choosePosture(plain(row), { choice, now: actedAt });
    row.choice = next.choice;
    row.chosenAt = actedAt;
    row.liveChanged = next.liveChanged;
    if (row.save) await row.save();
    return { overlay: await readStress({ WikiPage, WorldModelScenario, userId, pageId }), scenario: next };
  } catch (error) {
    throw wrap(error);
  }
};

const readWatch = async ({ WikiPage, ResearchMandate, userId, pageId } = {}) => {
  const page = await loadPage(WikiPage, pageId, userId);
  if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
  if (!ResearchMandate?.findOne) return { silent: true, note: '' };
  const mandate = await resolveQuery(ResearchMandate.findOne({ userId, pageId: id(page) }));
  return { page, watch: serializeWatch(plain(mandate)), mandate: mandate ? plain(mandate) : null };
};

const openWatch = async ({
  WikiPage, ResearchMandate, NoeisReceipt, userId, pageId, purpose, sources, budget, requestId = '', now = () => new Date()
} = {}) => {
  try {
    const actedAt = now();
    const page = await loadPage(WikiPage, pageId, userId);
    if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
    const drafted = openMandate({ purpose, sources, budget, pageId: id(page), actorId: userId, now: actedAt });
    let mandate = ResearchMandate?.findOne
      ? await resolveQuery(ResearchMandate.findOne({ userId, pageId: id(page) }))
      : null;
    if (mandate && mandate.status !== 'killed') {
      return { watch: serializeWatch(plain(mandate)), mandate: plain(mandate), idempotent: true };
    }
    mandate = await ResearchMandate.create({ ...drafted, userId, requestId: clean(requestId, 80) });
    const receipt = await persistReceipt({
      NoeisReceipt, userId, kind: 'research_watch_opened', title: 'A watch was named',
      summary: drafted.purpose, page, requestId, action: 'watch.open', extra: { at: actedAt }
    });
    return { watch: serializeWatch(plain(mandate)), mandate: plain(mandate), receipt, idempotent: false };
  } catch (error) {
    throw wrap(error);
  }
};

const routeWatchProposal = async ({
  WikiPage, ResearchMandate, NoeisReceipt, userId, pageId, summary, source, claimText, now = () => new Date()
} = {}) => {
  try {
    const actedAt = now();
    const page = await loadPage(WikiPage, pageId, userId);
    if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
    const mandate = ResearchMandate?.findOne
      ? await resolveQuery(ResearchMandate.findOne({ userId, pageId: id(page) }))
      : null;
    if (!mandate) throw new InstitutionError('There is no watch on this case.', 404, 'not_found');
    const next = proposeFromWatch(plain(mandate), { summary, source, claimText }, { now: actedAt });
    Object.assign(mandate, next.mandate);
    if (mandate.markModified) mandate.markModified('proposals');
    if (mandate.save) await mandate.save();
    const receipt = next.proposal ? await persistReceipt({
      NoeisReceipt, userId, kind: 'research_watch_proposed', title: 'The watch left a note',
      summary: next.proposal.summary, page, requestId: next.proposal.id, action: 'watch.propose', extra: { at: actedAt }
    }) : null;
    return { watch: serializeWatch(plain(mandate)), mandate: plain(mandate), proposal: next.proposal, silence: next.silence, receipt };
  } catch (error) {
    throw wrap(error);
  }
};

const acceptWatchProposal = async ({
  WikiPage, ResearchMandate, userId, pageId, proposalId, now = () => new Date()
} = {}) => {
  const actedAt = now();
  const page = await loadPage(WikiPage, pageId, userId);
  if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
  const mandate = await resolveQuery(ResearchMandate.findOne({ userId, pageId: id(page) }));
  if (!mandate) throw new InstitutionError('There is no watch on this case.', 404, 'not_found');
  const next = acceptProposal(plain(mandate), proposalId, { actorId: userId, now: actedAt });
  Object.assign(mandate, next);
  if (mandate.markModified) mandate.markModified('proposals');
  if (mandate.save) await mandate.save();
  return { watch: serializeWatch(plain(mandate)), mandate: plain(mandate) };
};

const reverseWatchProposal = async ({
  WikiPage, ResearchMandate, userId, pageId, proposalId, now = () => new Date()
} = {}) => {
  const actedAt = now();
  const page = await loadPage(WikiPage, pageId, userId);
  if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
  const mandate = await resolveQuery(ResearchMandate.findOne({ userId, pageId: id(page) }));
  if (!mandate) throw new InstitutionError('There is no watch on this case.', 404, 'not_found');
  const next = reverseProposal(plain(mandate), proposalId, { actorId: userId, now: actedAt });
  Object.assign(mandate, next);
  if (mandate.markModified) mandate.markModified('proposals');
  if (mandate.save) await mandate.save();
  return { watch: serializeWatch(plain(mandate)), mandate: plain(mandate) };
};

const killResearchWatch = async ({
  WikiPage, ResearchMandate, userId, pageId, now = () => new Date()
} = {}) => {
  const actedAt = now();
  const page = await loadPage(WikiPage, pageId, userId);
  if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
  const mandate = await resolveQuery(ResearchMandate.findOne({ userId, pageId: id(page) }));
  if (!mandate) throw new InstitutionError('There is no watch on this case.', 404, 'not_found');
  const next = killWatch(plain(mandate), { actorId: userId, now: actedAt });
  Object.assign(mandate, next);
  if (mandate.save) await mandate.save();
  return { watch: serializeWatch(plain(mandate)), mandate: plain(mandate) };
};

const readMemory = async ({
  WikiPage, CrossCaseLink, DecisionMemoryEvent, CaseTeam, userId, pageId, publicOnly = false
} = {}) => {
  const page = await loadPage(WikiPage, pageId);
  if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
  const team = CaseTeam?.findOne ? await resolveQuery(CaseTeam.findOne({ hostPageId: id(page) })) : null;
  const viewer = team ? seatFor(plain(team), userId, page) : { id: userId };
  const links = await listLinks(CrossCaseLink, { userId: page.userId, pageId: id(page) });
  const extras = { lineage: serializeThread(links.map(plain)), receipts: [] };
  if (publicOnly) {
    return project({ page, viewer: { id: userId }, extras, team: null });
  }
  return project({ page, viewer: { id: userId, ...viewer }, extras, team: team ? plain(team) : null });
};

const readAudit = async ({ DecisionMemoryEvent, userId, pageId } = {}) => {
  if (!DecisionMemoryEvent?.find) return { events: [] };
  const filter = { userId };
  if (pageId) filter.pageId = pageId;
  let query = DecisionMemoryEvent.find(filter);
  if (query?.sort) query = query.sort({ at: 1 });
  if (query?.lean) query = query.lean();
  const events = await resolveQuery(query);
  return { schema: SCHEMA_VERSION, events: replayAudit(list(events).map(plain)) };
};

const exportInstitution = async ({
  WikiPage, CrossCaseLink, InstitutionalHold, userId, secret, now = () => new Date()
} = {}) => {
  try {
    let pagesQuery = WikiPage.find({
      userId,
      status: { $ne: 'archived' },
      'judgment.currentJudgment': { $type: 'string', $ne: '' }
    });
    if (pagesQuery?.lean) pagesQuery = pagesQuery.lean();
    const pages = await resolveQuery(pagesQuery);
    let linksQuery = CrossCaseLink?.find ? CrossCaseLink.find({ userId }) : null;
    if (linksQuery?.lean) linksQuery = linksQuery.lean();
    const lineage = linksQuery ? await resolveQuery(linksQuery) : [];
    let holdsQuery = InstitutionalHold?.find ? InstitutionalHold.find({ userId, releasedAt: null }) : null;
    if (holdsQuery?.lean) holdsQuery = holdsQuery.lean();
    const holds = holdsQuery ? await resolveQuery(holdsQuery) : [];
    return exportBundle({
      pages: list(pages),
      lineage: list(lineage).map(plain),
      holds: list(holds).map(plain),
      secret,
      signedAt: now(),
      ownerId: userId
    });
  } catch (error) {
    throw wrap(error);
  }
};

const importInstitution = async ({ bundle, secret } = {}) => {
  try {
    return validateImport(bundle, { secret });
  } catch (error) {
    throw wrap(error);
  }
};

const holdCase = async ({
  WikiPage, InstitutionalHold, userId, pageId, kind, until, note, now = () => new Date()
} = {}) => {
  const page = await loadPage(WikiPage, pageId, userId);
  if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
  const drafted = placeHold({ pageId: id(page), kind, until, note, actorId: userId, now: now() });
  const created = await InstitutionalHold.create({ ...drafted, userId });
  return { hold: plain(created) };
};

const forgetInstitutionCase = async ({
  WikiPage, InstitutionalHold, userId, pageId, now = () => new Date()
} = {}) => {
  try {
    const actedAt = now();
    const page = await loadPage(WikiPage, pageId, userId);
    if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
    let holdsQuery = InstitutionalHold?.find
      ? InstitutionalHold.find({ userId, pageId: id(page), releasedAt: null })
      : [];
    if (holdsQuery?.lean) holdsQuery = holdsQuery.lean();
    const holds = holdsQuery.then ? await holdsQuery : holdsQuery;
    if (isHeld(holds, id(page), actedAt)) {
      throw forgetCase({ page, holds, now: actedAt });
    }
    const tombstone = forgetCase({ page, holds, now: actedAt });
    page.status = 'archived';
    if (page.judgment) page.judgment.status = 'withdrawn';
    if (page.markModified) page.markModified('judgment');
    if (page.save) await page.save();
    else if (WikiPage?.updateOne) {
      await WikiPage.updateOne({ _id: id(page) }, { $set: { status: 'archived', 'judgment.status': 'withdrawn' } });
    }
    return tombstone;
  } catch (error) {
    throw wrap(error);
  }
};

const correctInstitutionCase = async ({
  WikiPage, userId, pageId, summary, now = () => new Date()
} = {}) => {
  const page = await loadPage(WikiPage, pageId, userId);
  if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
  return correctCase({ page, summary, now: now() });
};

const transferCase = async ({
  WikiPage, userId, pageId, toUserId, now = () => new Date()
} = {}) => {
  try {
    const actedAt = now();
    const page = await loadPage(WikiPage, pageId, userId);
    if (!page) throw new InstitutionError('This case was not found.', 404, 'not_found');
    const succession = transferOwnership({ page, fromUserId: userId, toUserId, now: actedAt });
    page.userId = toUserId;
    if (page.save) await page.save();
    else if (WikiPage?.updateOne) {
      await WikiPage.updateOne({ _id: id(page) }, { $set: { userId: toUserId } });
    }
    return succession;
  } catch (error) {
    throw wrap(error);
  }
};

module.exports = {
  InstitutionError,
  acceptLineage,
  acceptWatchProposal,
  chooseStress,
  correctInstitutionCase,
  draftStress,
  exportInstitution,
  forgetInstitutionCase,
  holdCase,
  importInstitution,
  killResearchWatch,
  openWatch,
  proposeLineage,
  readAdapter,
  readAudit,
  readCalibration,
  readLineage,
  readMemory,
  readStress,
  readWatch,
  rejectLineage,
  reverseWatchProposal,
  routeWatchProposal,
  transferCase
};
