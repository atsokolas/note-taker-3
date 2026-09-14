const crypto = require('crypto');
const { isDuplicateKey, shareSlug } = require('./authoredNotebookShare');
const {
  AGENT_MANDATE_PAUSE,
  evaluateAgentMandate,
  MANDATE_NEEDS_FIELDS,
  openAgentMandate,
  pauseAgentMandate,
  projectAgentMandate
} = require('./governedResearch');

/**
 * C6/C7: a shared question or concept leaves the workshop as a frozen snapshot.
 *
 * Same URL contract as a notebook share — one slug, an explicit freeze, an
 * explicit later update under that URL. Private edits never rewrite the
 * published copy. Wiki shares stay live. This file replaces the inline
 * sanitizers that used to assemble a public page from live documents.
 *
 * C7: a second person may offer a bounded reading beside a published question.
 * That reading is not merged into the snapshot. The owner may later say how
 * they take it; the original writing stays. A new reading is held until
 * the owner places it. The offerer may take it back while the door stays
 * open. Concurrent place, take, and withdraw keep both acts; they do not
 * last-write-win. A brief may close the page with what holds, what still
 * holds, and what could move this. Consensus is optional. The owner may
 * later hand that decision to a successor: frozen alternatives, evidence
 * then, uncertainty, authority, review conditions, and an optional later
 * outcome. The successor opens at the last unresolved question. An agent
 * mandate on that door names an owner, scope, tools, budget, stop, and
 * review, and pauses when ownership or authority lapses. The companion
 * is bound to this public page only. Libraries stay private.
 */

const PREVIEW_STALE = {
  question: 'The question changed since you previewed it. Refresh the preview before sharing.',
  concept: 'The concept changed since you previewed it. Refresh the preview before sharing.'
};

const CONTRIBUTION_TAKEN_BACK = 'They took this back.';
const CONTRIBUTION_TAKE_CHANGED = 'This take was already changed.';
const CONTRIBUTION_HELD = 'Place this reading before you say how you take it.';
const BRIEF_NEEDS_READING = 'Place a reading before you write a brief.';
const SUCCESSION_NEEDS_UNRESOLVED = 'Close the brief at an unresolved question before you hand this on.';

const NOT_PUBLISHED = {
  question: 'This question is not published.',
  concept: 'This concept is not published.'
};

const CONTRIBUTION_LIMIT = 12;
const CONTRIBUTION_CHARS = 800;
const CONTRIBUTION_REMAINDER_CHARS = 400;
const CONTRIBUTION_BY_CHARS = 80;

const publicText = (value = '', limit = 8000) => String(value == null ? '' : value)
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

const stripTags = (value = '') => publicText(
  String(value || '').replace(/<[^>]*>/g, ' '),
  8000
);

const asIso = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const readLean = async (query) => {
  if (!query) return null;
  if (typeof query.lean === 'function') return query.lean();
  return query;
};

const asRow = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

const idOf = (row) => String(row?._id || row?.id || '');

const sanitizeParagraphBlocks = (blocks = []) => (
  (Array.isArray(blocks) ? blocks : [])
    .filter((block) => (
      block?.type === 'paragraph'
      && !String(block?.sourcePath || '').trim()
      && !String(block?.articleId || '').trim()
      && !String(block?.articleTitle || '').trim()
    ))
    .map((block) => ({
      id: String(block?.id || ''),
      type: 'paragraph',
      text: String(block?.text || '').trim()
    }))
    .filter((block) => block.text)
);

const sanitizeCard = (card) => ({
  id: String(card?.id || ''),
  type: String(card?.type || ''),
  title: String(card?.title || ''),
  content: String(card?.content || ''),
  whyItMatters: String(card?.whyItMatters || ''),
  strength: String(card?.strength || ''),
  confidence: String(card?.confidence || '')
});

const projectPublicQuestion = (question = {}, ownerDisplayName = '') => ({
  ownerDisplayName: publicText(ownerDisplayName, 200),
  question: {
    text: publicText(question?.text, 8000),
    status: question?.status === 'answered' ? 'answered' : 'open',
    conceptName: publicText(question?.conceptName || question?.linkedTagName, 400),
    paragraphs: sanitizeParagraphBlocks(question?.blocks)
  }
});

const projectPublicConcept = (concept = {}, ownerDisplayName = '') => {
  const workbench = (concept?.ideaWorkbench && typeof concept.ideaWorkbench === 'object')
    ? concept.ideaWorkbench
    : {};
  const cards = Array.isArray(workbench.cards) ? workbench.cards : [];
  return {
    ownerDisplayName: publicText(ownerDisplayName, 200),
    concept: {
      name: publicText(concept?.name, 400),
      description: String(concept?.description || ''),
      hypothesisHtml: String(workbench?.hypothesis?.html || ''),
      framing: String(workbench?.header?.prompt || ''),
      supports: cards.filter((card) => card?.zone === 'supports').map(sanitizeCard),
      contradictions: cards.filter((card) => card?.zone === 'contradictions').map(sanitizeCard),
      questions: cards.filter((card) => card?.zone === 'questions').map(sanitizeCard)
    }
  };
};

const hashPublicQuestion = (preview) => crypto
  .createHash('sha256')
  .update(JSON.stringify({
    ownerDisplayName: preview?.ownerDisplayName || '',
    question: preview?.question || {}
  }))
  .digest('hex');

const hashPublicConcept = (preview) => crypto
  .createHash('sha256')
  .update(JSON.stringify({
    ownerDisplayName: preview?.ownerDisplayName || '',
    concept: preview?.concept || {}
  }))
  .digest('hex');

const canPublishQuestion = (preview) => Boolean(publicText(preview?.question?.text, 8000));
const canPublishConcept = (preview) => Boolean(publicText(preview?.concept?.name, 400));

const freezeThinkSnapshot = (preview, publishedAt, extra = {}) => {
  const body = { ...(preview || {}) };
  delete body.publishedAt;
  delete body.revisedAt;
  delete body.correction;
  delete body.contributions;
  delete body.contribution;
  delete body.interpretation;
  delete body.interpretedBy;
  delete body.waiting;
  delete body.yours;
  delete body.mine;
  delete body.brief;
  delete body.agreement;
  delete body.observation;
  delete body.succession;
  delete body.unresolved;
  delete body.alternatives;
  delete body.mandate;
  delete body.here;
  delete body.presence;
  const iso = asIso(publishedAt);
  const revised = asIso(extra.revisedAt);
  const correction = publicText(stripTags(extra.correction), 400);
  return {
    ...body,
    ...(iso ? { publishedAt: iso } : {}),
    ...(revised && revised !== iso ? { revisedAt: revised } : {}),
    ...(correction ? { correction } : {})
  };
};

const contributionBy = (value) => publicText(stripTags(value), CONTRIBUTION_BY_CHARS);
const contributionText = (value) => publicText(stripTags(value), CONTRIBUTION_CHARS);
const contributionRemainder = (value) => publicText(stripTags(value), CONTRIBUTION_REMAINDER_CHARS);

const projectContribution = (row = {}, extra = {}) => {
  const by = contributionBy(row.by);
  const text = contributionText(row.text);
  if (!by || !text) return null;
  const remainder = contributionRemainder(row.remainder);
  const interpretation = contributionRemainder(row.interpretation);
  const interpretedBy = contributionBy(extra.interpretedBy);
  const updatedAt = extra.includeUpdatedAt ? asIso(row.updatedAt) : '';
  return {
    id: idOf(row),
    by,
    text,
    ...(remainder ? { remainder } : {}),
    ...(interpretation && interpretedBy ? { interpretation, interpretedBy } : {}),
    createdAt: asIso(row.createdAt),
    ...(updatedAt ? { updatedAt } : {})
  };
};

const projectContributionList = (rows, extra = {}) => (Array.isArray(rows) ? rows : [])
  .map((row) => projectContribution(row, extra))
  .filter(Boolean);

const contributionHeld = (row) => row?.held === true;
const contributionWithdrawn = (row) => Boolean(row?.withdrawnAt);
const placedContributions = (rows) => (Array.isArray(rows) ? rows : [])
  .filter((row) => !contributionHeld(row) && !contributionWithdrawn(row));
const heldContributions = (rows) => (Array.isArray(rows) ? rows : [])
  .filter((row) => contributionHeld(row) && !contributionWithdrawn(row));
const contributionConflict = (row, { expectPlaced = false, expectedUpdatedAt = '' } = {}) => {
  if (contributionWithdrawn(row)) {
    return { error: CONTRIBUTION_TAKEN_BACK, field: 'withdrawn' };
  }
  if (expectPlaced && contributionHeld(row)) {
    return { error: CONTRIBUTION_HELD, field: 'held' };
  }
  const expected = asIso(expectedUpdatedAt);
  const current = asIso(row?.updatedAt);
  if (expected && current && expected !== current) {
    return { error: CONTRIBUTION_TAKE_CHANGED, field: 'updatedAt' };
  }
  return null;
};
const contributionViewerId = (row) => String(row?.contributorUserId || '').trim();
const contributionOwnedBy = (row, viewerUserId) => {
  const viewer = String(viewerUserId || '').trim();
  return Boolean(viewer && contributionViewerId(row) === viewer);
};
const yoursContributions = (rows, viewerUserId) => (
  heldContributions(rows).filter((row) => contributionOwnedBy(row, viewerUserId))
);

const projectShareBrief = (share, contributions = [], { includeEmpty = false } = {}) => {
  if (!placedContributions(contributions).length) return null;
  const agreement = contributionRemainder(share?.brief?.agreement);
  const remainder = contributionRemainder(share?.brief?.remainder);
  const observation = contributionRemainder(share?.brief?.observation);
  if (!includeEmpty && !agreement && !remainder && !observation) return null;
  const by = contributionBy(share?.ownerDisplayName);
  if (includeEmpty) {
    return { agreement, remainder, observation, ...(by ? { by } : {}) };
  }
  return {
    ...(agreement ? { agreement } : {}),
    ...(remainder ? { remainder } : {}),
    ...(observation ? { observation } : {}),
    ...(by ? { by } : {})
  };
};

const evidenceThenOf = (share = {}) => {
  const snapshot = share?.snapshot && typeof share.snapshot === 'object' ? share.snapshot : null;
  const question = snapshot?.question || {};
  const text = publicText(question?.text, 8000);
  if (!text) return null;
  const paragraphs = (Array.isArray(question.paragraphs) ? question.paragraphs : [])
    .map((block) => ({
      id: String(block?.id || ''),
      type: 'paragraph',
      text: publicText(block?.text, 8000)
    }))
    .filter((block) => block.text);
  const publishedAt = asIso(snapshot?.publishedAt || share?.publishedAt);
  return {
    text,
    ...(paragraphs.length ? { paragraphs } : {}),
    ...(publishedAt ? { publishedAt } : {})
  };
};

const freezeShareSuccession = (share, contributions = [], { outcome = '', at = new Date() } = {}) => {
  const alternatives = projectContributionList(
    placedContributions(contributions),
    { interpretedBy: share?.ownerDisplayName }
  );
  if (!alternatives.length) {
    return { error: BRIEF_NEEDS_READING, field: 'succession' };
  }
  const remainder = contributionRemainder(share?.brief?.remainder);
  const observation = contributionRemainder(share?.brief?.observation);
  const unresolved = remainder || observation;
  if (!unresolved) {
    return { error: SUCCESSION_NEEDS_UNRESOLVED, field: 'succession' };
  }
  const evidenceThen = evidenceThenOf(share);
  if (!evidenceThen) {
    return { error: NOT_PUBLISHED.question, field: 'succession' };
  }
  const agreement = contributionRemainder(share?.brief?.agreement);
  const authority = contributionBy(share?.ownerDisplayName);
  const later = contributionRemainder(outcome);
  const handedAt = asIso(at) || asIso(new Date());
  return {
    succession: {
      unresolved,
      alternatives,
      evidenceThen,
      ...(remainder ? { uncertainty: remainder } : {}),
      ...(authority ? { authority } : {}),
      ...(observation ? { review: observation } : {}),
      ...(agreement ? { held: agreement } : {}),
      ...(later ? { outcome: later } : {}),
      ...(handedAt ? { handedAt } : {})
    }
  };
};

const withSuccessionOutcome = (succession = {}, outcome = '') => {
  const next = succession && typeof succession === 'object' ? { ...succession } : {};
  const later = contributionRemainder(outcome);
  if (later) next.outcome = later;
  else delete next.outcome;
  return next;
};

const projectShareSuccession = (share, { includeEmpty = false } = {}) => {
  const raw = share?.succession && typeof share.succession === 'object' ? share.succession : null;
  if (!raw) return null;
  const unresolved = contributionRemainder(raw.unresolved);
  const alternatives = projectContributionList(raw.alternatives || []);
  const evidenceThen = raw.evidenceThen && typeof raw.evidenceThen === 'object'
    ? {
      text: publicText(raw.evidenceThen.text, 8000),
      ...(Array.isArray(raw.evidenceThen.paragraphs)
        ? {
          paragraphs: raw.evidenceThen.paragraphs
            .map((block) => ({
              id: String(block?.id || ''),
              type: 'paragraph',
              text: publicText(block?.text, 8000)
            }))
            .filter((block) => block.text)
        }
        : {}),
      ...(asIso(raw.evidenceThen.publishedAt) ? { publishedAt: asIso(raw.evidenceThen.publishedAt) } : {})
    }
    : null;
  if (!unresolved || !alternatives.length || !evidenceThen?.text) return null;
  const remainder = contributionRemainder(raw.uncertainty);
  const observation = contributionRemainder(raw.review);
  const agreement = contributionRemainder(raw.held);
  const authority = contributionBy(raw.authority || share?.ownerDisplayName);
  const later = contributionRemainder(raw.outcome);
  const handedAt = asIso(raw.handedAt);
  return {
    unresolved,
    alternatives,
    evidenceThen,
    ...(remainder ? { uncertainty: remainder } : {}),
    ...(authority ? { authority } : {}),
    ...(observation ? { review: observation } : {}),
    ...(agreement ? { held: agreement } : {}),
    ...(later ? { outcome: later } : (includeEmpty ? { outcome: '' } : {})),
    ...(handedAt ? { handedAt } : {})
  };
};

const freezeShareMandate = (share, fields = {}, { now = new Date() } = {}) => {
  if (!share?.snapshot || typeof share.snapshot !== 'object') {
    return { error: NOT_PUBLISHED.question, field: 'mandate' };
  }
  try {
    return {
      mandate: openAgentMandate({
        owner: fields.owner || share.ownerDisplayName,
        ownerId: share.userId,
        scope: fields.scope,
        tools: fields.tools,
        budget: fields.budget,
        stop: fields.stop,
        review: fields.review,
        now
      })
    };
  } catch (error) {
    return {
      error: error.message || MANDATE_NEEDS_FIELDS,
      field: 'mandate'
    };
  }
};

const endShareMandate = (mandate, { now = new Date() } = {}) => (
  pauseAgentMandate(mandate, { reason: AGENT_MANDATE_PAUSE.ended, now })
);

const projectShareMandate = (share) => {
  const projected = projectAgentMandate(share?.mandate);
  if (!projected) return null;
  const evaluation = evaluateAgentMandate(share?.mandate, { ownerId: share?.userId });
  if (!evaluation.lapsed || projected.status === 'paused') return projected;
  return {
    ...projected,
    status: 'paused',
    pause: evaluation.reason
  };
};

const persistShareMandate = async (SharedQuestion, slug, mandate) => {
  if (!SharedQuestion?.findOneAndUpdate) return mandate;
  const updated = asRow(await SharedQuestion.findOneAndUpdate(
    { slug },
    { $set: { mandate } },
    { new: true }
  ));
  return updated?.mandate || mandate;
};

const claimShareAgentAsk = async (SharedQuestion, { slug = '', now = new Date() } = {}) => {
  const key = String(slug || '').trim();
  if (!key || !SharedQuestion?.findOne) return { ok: true };
  const found = SharedQuestion.findOne({ slug: key });
  const selected = typeof found?.select === 'function'
    ? found.select('userId mandate')
    : found;
  const share = asRow(await readLean(selected));
  const raw = share?.mandate && typeof share.mandate === 'object' ? share.mandate : null;
  if (!projectShareMandate({ mandate: raw })) return { ok: true };
  const evaluation = evaluateAgentMandate(raw, { ownerId: share.userId, now });
  if (evaluation.lapsed) {
    if (raw.status === 'live' && !raw.pausedAt) {
      await persistShareMandate(
        SharedQuestion,
        key,
        pauseAgentMandate(raw, { reason: evaluation.reason, now })
      );
    }
    return { paused: true, reason: evaluation.reason };
  }
  if (!SharedQuestion.findOneAndUpdate) {
    return { paused: true, reason: AGENT_MANDATE_PAUSE.budget };
  }
  const updated = asRow(await SharedQuestion.findOneAndUpdate(
    {
      slug: key,
      'mandate.status': 'live',
      'mandate.budget.remaining': { $gt: 0 }
    },
    {
      $inc: {
        'mandate.budget.spent': 1,
        'mandate.budget.remaining': -1
      }
    },
    { new: true }
  ));
  const remaining = Number(updated?.mandate?.budget?.remaining);
  if (!updated?.mandate || Number.isNaN(remaining)) {
    return { paused: true, reason: AGENT_MANDATE_PAUSE.budget };
  }
  if (remaining <= 0) {
    await persistShareMandate(
      SharedQuestion,
      key,
      pauseAgentMandate(updated.mandate, { reason: AGENT_MANDATE_PAUSE.budget, now })
    );
  }
  return { ok: true };
};

const PRESENCE_TTL_MS = 75 * 1000;

const presenceViewerId = (value) => String(value || '').trim();

const presenceNameFor = (share, contributions, viewerUserId) => {
  const viewer = presenceViewerId(viewerUserId);
  if (!viewer) return '';
  if (viewer === presenceViewerId(share?.userId)) {
    return contributionBy(share?.ownerDisplayName);
  }
  const row = (Array.isArray(contributions) ? contributions : []).find(
    (item) => presenceViewerId(item?.contributorUserId) === viewer
  );
  return row ? contributionBy(row.by) : '';
};

const projectPresence = (rows, viewerUserId = '', now = Date.now()) => {
  const viewer = presenceViewerId(viewerUserId);
  const cutoff = now - PRESENCE_TTL_MS;
  const seen = new Set();
  const here = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const at = new Date(row?.at).getTime();
    if (!Number.isFinite(at) || at < cutoff) return;
    if (viewer && presenceViewerId(row?.userId) === viewer) return;
    const by = contributionBy(row?.by);
    if (!by || seen.has(by)) return;
    seen.add(by);
    here.push({ by });
  });
  here.sort((left, right) => left.by.localeCompare(right.by));
  return here;
};

const presenceLine = (here) => {
  const names = (Array.isArray(here) ? here : [])
    .map((row) => contributionBy(row?.by || row))
    .filter(Boolean);
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} is here.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are here.`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} are here.`;
};

const loadQuestionPresence = async (QuestionPresence, slug) => {
  if (!QuestionPresence?.find) return [];
  const key = publicText(slug, 80);
  if (!key) return [];
  const found = QuestionPresence.find({ slug: key });
  const rows = found && typeof found.lean === 'function' ? await found.lean() : await found;
  return Array.isArray(rows) ? rows : [];
};

const beatQuestionPresence = async (QuestionPresence, { slug, userId, by } = {}) => {
  if (!QuestionPresence?.findOneAndUpdate) return null;
  const key = publicText(slug, 80);
  const id = presenceViewerId(userId);
  const name = contributionBy(by);
  if (!key || !id || !name) return null;
  const updated = await QuestionPresence.findOneAndUpdate(
    { slug: key, userId: id },
    { $set: { slug: key, userId: id, by: name, at: new Date() } },
    { upsert: true, new: true }
  );
  if (!updated) return null;
  if (typeof updated.lean === 'function') return updated.lean();
  return updated;
};

const clearQuestionPresence = async (QuestionPresence, slug) => {
  const key = publicText(slug, 80);
  if (!QuestionPresence?.deleteMany || !key) return;
  await QuestionPresence.deleteMany({ slug: key });
};

const loadQuestionContributions = async (QuestionContribution, query) => {
  if (!QuestionContribution?.find) return [];
  const found = QuestionContribution.find(query);
  const sorted = found?.sort ? found.sort({ createdAt: 1, _id: 1 }) : found;
  const rows = sorted && typeof sorted.lean === 'function' ? await sorted.lean() : await sorted;
  return Array.isArray(rows) ? rows : [];
};

// Bound to this published door, not the question's lifetime readings.
// $ifNull lets older rows without contributionCount still take a slot.
const contributionSlotFilter = (slug) => ({
  slug: publicText(slug, 80),
  snapshot: { $ne: null },
  $expr: { $lt: [{ $ifNull: ['$contributionCount', 0] }, CONTRIBUTION_LIMIT] }
});

const claimContributionSlot = async (SharedQuestion, slug) => {
  const filter = contributionSlotFilter(slug);
  if (!filter.slug || !SharedQuestion?.findOneAndUpdate) return null;
  const updated = SharedQuestion.findOneAndUpdate(
    filter,
    { $inc: { contributionCount: 1 } },
    { new: true }
  );
  if (!updated) return null;
  if (typeof updated.lean === 'function') return updated.lean();
  return updated;
};

const releaseContributionSlot = async (SharedQuestion, slug) => {
  const key = publicText(slug, 80);
  if (!key || !SharedQuestion?.findOneAndUpdate) return null;
  const updated = SharedQuestion.findOneAndUpdate(
    { slug: key, contributionCount: { $gt: 0 } },
    { $inc: { contributionCount: -1 } },
    { new: true }
  );
  if (!updated) return null;
  if (typeof updated.lean === 'function') return updated.lean();
  return updated;
};

const publicQuestionPage = (share, contributions = [], viewerUserId = '', presenceRows = []) => {
  const snapshot = share?.snapshot && typeof share.snapshot === 'object'
    ? { ...share.snapshot }
    : null;
  if (!snapshot) return null;
  delete snapshot.contributions;
  delete snapshot.contribution;
  delete snapshot.interpretation;
  delete snapshot.interpretedBy;
  delete snapshot.waiting;
  delete snapshot.yours;
  delete snapshot.mine;
  delete snapshot.brief;
  delete snapshot.agreement;
  delete snapshot.observation;
  delete snapshot.succession;
  delete snapshot.unresolved;
  delete snapshot.alternatives;
  delete snapshot.mandate;
  delete snapshot.here;
  delete snapshot.presence;
  const extra = { interpretedBy: share.ownerDisplayName };
  const yours = projectContributionList(yoursContributions(contributions, viewerUserId), extra);
  const brief = projectShareBrief(share, contributions);
  const succession = projectShareSuccession(share);
  const mandate = projectShareMandate(share);
  const here = projectPresence(presenceRows, viewerUserId);
  const viewer = String(viewerUserId || '').trim();
  const published = placedContributions(contributions)
    .map((row) => {
      const projected = projectContribution(row, extra);
      if (!projected) return null;
      if (viewer && contributionOwnedBy(row, viewer)) return { ...projected, mine: true };
      return projected;
    })
    .filter(Boolean);
  return {
    ...snapshot,
    contributions: published,
    ...(yours.length ? { yours } : {}),
    ...(brief ? { brief } : {}),
    ...(succession ? { succession } : {}),
    ...(mandate ? { mandate } : {}),
    ...(here.length ? { here } : {})
  };
};

const missingSnapshot = (share) => (
  !share?.snapshot || typeof share.snapshot !== 'object'
);

const thinkShareState = (share, {
  preview = null,
  currentHash = '',
  kind = 'question',
  contributions = [],
  here = null
} = {}) => {
  const publishable = kind === 'concept'
    ? canPublishConcept(preview)
    : canPublishQuestion(preview);
  const extra = {
    interpretedBy: share?.ownerDisplayName || preview?.ownerDisplayName,
    includeUpdatedAt: kind === 'question'
  };
  const readings = kind === 'question'
    ? projectContributionList(placedContributions(contributions), extra)
    : null;
  const waiting = kind === 'question' && share
    ? projectContributionList(heldContributions(contributions), extra)
    : null;
  const brief = kind === 'question' && share
    ? projectShareBrief(share, contributions, { includeEmpty: true })
    : null;
  const succession = kind === 'question' && share
    ? projectShareSuccession(share, { includeEmpty: true })
    : null;
  const mandate = kind === 'question' && share
    ? projectShareMandate(share)
    : null;
  if (!share) {
    return {
      shared: false,
      publishable,
      ownerDisplayName: preview?.ownerDisplayName || '',
      preview,
      currentHash,
      ...(readings ? { contributions: readings } : {})
    };
  }
  const snapshot = share.snapshot && typeof share.snapshot === 'object'
    ? { ...share.snapshot }
    : null;
  if (snapshot) {
    delete snapshot.brief;
    delete snapshot.agreement;
    delete snapshot.observation;
    delete snapshot.succession;
    delete snapshot.unresolved;
    delete snapshot.alternatives;
    delete snapshot.mandate;
    delete snapshot.contributions;
    delete snapshot.waiting;
    delete snapshot.yours;
    delete snapshot.here;
    delete snapshot.presence;
  }
  const present = kind === 'question' && Array.isArray(here) ? here : null;
  return {
    shared: true,
    publishable,
    slug: share.slug,
    ownerDisplayName: share.ownerDisplayName || preview?.ownerDisplayName || '',
    publishedAt: share.publishedAt || share.snapshot?.publishedAt || null,
    contentHash: share.contentHash || '',
    currentHash,
    stale: Boolean(share.contentHash && currentHash && share.contentHash !== currentHash),
    preview,
    snapshot,
    ...(readings ? { contributions: readings } : {}),
    ...(waiting && waiting.length ? { waiting } : {}),
    ...(brief ? { brief } : {}),
    ...(succession ? { succession } : {}),
    ...(mandate ? { mandate } : {}),
    ...(present && present.length ? { here: present } : {})
  };
};

const ownerNameOf = async (User, userId) => {
  if (!User?.findById) return '';
  try {
    const owner = await readLean(User.findById(userId).select('name displayName email'));
    return publicText(
      owner?.displayName
      || owner?.name
      || String(owner?.email || '').split('@')[0],
      200
    );
  } catch (_error) {
    return '';
  }
};

const liveQuestionPreview = async ({ User, question, userId }) => {
  const ownerDisplayName = await ownerNameOf(User, userId);
  const preview = projectPublicQuestion(question, ownerDisplayName);
  return {
    preview,
    currentHash: hashPublicQuestion(preview),
    ownerDisplayName,
    publishable: canPublishQuestion(preview)
  };
};

const liveConceptPreview = async ({ User, concept, userId }) => {
  const ownerDisplayName = await ownerNameOf(User, userId);
  const preview = projectPublicConcept(concept, ownerDisplayName);
  return {
    preview,
    currentHash: hashPublicConcept(preview),
    ownerDisplayName,
    publishable: canPublishConcept(preview)
  };
};

module.exports = {
  BRIEF_NEEDS_READING,
  SUCCESSION_NEEDS_UNRESOLVED,
  MANDATE_NEEDS_FIELDS,
  CONTRIBUTION_BY_CHARS,
  CONTRIBUTION_CHARS,
  CONTRIBUTION_HELD,
  CONTRIBUTION_LIMIT,
  CONTRIBUTION_REMAINDER_CHARS,
  CONTRIBUTION_TAKE_CHANGED,
  CONTRIBUTION_TAKEN_BACK,
  NOT_PUBLISHED,
  PREVIEW_STALE,
  PRESENCE_TTL_MS,
  asRow,
  beatQuestionPresence,
  canPublishConcept,
  canPublishQuestion,
  claimContributionSlot,
  claimShareAgentAsk,
  clearQuestionPresence,
  contributionBy,
  contributionConflict,
  contributionHeld,
  contributionRemainder,
  contributionSlotFilter,
  contributionText,
  contributionWithdrawn,
  endShareMandate,
  freezeShareMandate,
  freezeShareSuccession,
  freezeThinkSnapshot,
  hashPublicConcept,
  hashPublicQuestion,
  heldContributions,
  isDuplicateKey,
  liveConceptPreview,
  liveQuestionPreview,
  loadQuestionContributions,
  loadQuestionPresence,
  missingSnapshot,
  ownerNameOf,
  placedContributions,
  presenceLine,
  presenceNameFor,
  projectContribution,
  projectContributionList,
  projectPresence,
  projectPublicConcept,
  projectPublicQuestion,
  projectShareBrief,
  projectShareMandate,
  projectShareSuccession,
  publicQuestionPage,
  readLean,
  releaseContributionSlot,
  sanitizeCard,
  sanitizeParagraphBlocks,
  shareSlug,
  thinkShareState,
  withSuccessionOutcome
};
