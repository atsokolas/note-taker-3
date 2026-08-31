const {
  contractEvent,
  dedupeEvents,
  freshness,
  lastAcceptedClock
} = require('./consequenceEvent');
const { persistNoeisReceipt, serializeStoredReceipt } = require('./noeisReceiptService');
const { createWikiRevision, snapshotPage } = require('./wikiRevisionService');
const { ensureHeldClaim, findHeldClaim } = require('./heldClaim');
const { wordBoundaryTrim } = require('../lib/editorialText');

const ACTIONS = Object.freeze(['accept', 'narrow', 'preserve', 'reject', 'defer']);
const TERMINAL = new Set(['accepted', 'narrowed', 'preserved', 'rejected']);
const MUTATING = new Set(['accept', 'narrow']);
const REVIEW_MS = 7 * 24 * 60 * 60 * 1000;

const STOPWORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before',
  'being', 'between', 'both', 'but', 'can', 'could', 'did', 'does', 'doing',
  'for', 'from', 'further', 'had', 'has', 'have', 'having', 'how', 'into',
  'its', 'itself', 'just', 'more', 'most', 'not', 'only', 'other', 'our',
  'out', 'over', 'same', 'should', 'some', 'such', 'than', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'too', 'under', 'until', 'very', 'was', 'were', 'what', 'when',
  'where', 'which', 'while', 'who', 'why', 'will', 'with', 'would', 'you', 'your'
]);

const clean = (value = '', limit = 800) => wordBoundaryTrim(String(value || '').replace(/\s+/g, ' ').trim(), { maxLength: limit });

const id = (value) => String(value?._id || value?.id || value || '');
const asPlain = (value) => (value?.toObject ? value.toObject({ virtuals: false }) : value);
const list = (value) => (Array.isArray(value) ? value : []);

const stem = (word = '') => {
  const lower = String(word || '').toLowerCase();
  return lower.length < 5 ? lower : lower.replace(/(ies|ied|ing|ed|es|s|y)$/, '');
};

const tokens = (value = '') => clean(value, 4000)
  .toLowerCase()
  .replace(/[^a-z0-9\s'-]/g, ' ')
  .split(/\s+/)
  .map((word) => word.replace(/^[-']+|[-']+$/g, ''))
  .filter((word) => word.length > 2 && !STOPWORDS.has(word));

const binds = (text = '', claim = '') => {
  const terms = [...new Set(tokens(claim))];
  const roots = new Set(tokens(text).flatMap((token) => [token, stem(token)]));
  const matched = terms.filter((term) => roots.has(term) || roots.has(stem(term)));
  const ok = terms.length === 1
    ? matched.length === 1
    : terms.length <= 3
      ? matched.length >= 2
      : matched.length >= 2 && matched.length / terms.length >= 0.4;
  return { ok, matched, terms };
};

const heldClaimsOf = (page = {}) => {
  const sentence = clean(page?.judgment?.currentJudgment, 800);
  const claims = list(page?.claims).map(asPlain).filter((claim) => claim?.claimId && !claim.retiredAt);
  if (sentence) {
    const match = claims.find((claim) => clean(claim.text, 800) === sentence);
    if (match) return [match];
  }
  if (sentence) {
    return [{
      claimId: claims[0]?.claimId || `held:${id(page)}`,
      text: sentence,
      resolutionCriteria: page?.judgment?.resolutionCriteria || claims[0]?.resolutionCriteria || '',
      horizon: page?.judgment?.resolutionHorizonAt || claims[0]?.horizon || null,
      lastCheckedAt: claims[0]?.lastCheckedAt || page?.judgment?.lastReviewedAt
    }];
  }
  return claims.filter((claim) => claim.checkInStatus !== 'retired');
};

const namedMaterial = (page = {}, claim = {}) => {
  const assumption = clean(claim.text || page?.judgment?.currentJudgment, 800);
  const falsifiers = list(page?.judgment?.falsifiers)
    .filter((row) => row?.status !== 'retired')
    .map((row) => clean(row.text, 400))
    .filter(Boolean);
  const criteria = clean(claim.resolutionCriteria || page?.judgment?.resolutionCriteria, 400);
  if (criteria) falsifiers.push(criteria);
  const valuation = list(page?.judgment?.why).map((row) => clean(row.text, 400)).filter(Boolean);
  const decisions = list(page?.judgment?.decisions)
    .filter((row) => row?.status === 'taken' && !row?.outcome?.resolvedAt)
    .map((row) => clean(row.summary, 400))
    .filter(Boolean);
  return { assumption, falsifiers, valuation, decisions };
};

const materialHit = (passage, named) => {
  if (named.assumption && binds(passage, named.assumption).ok) {
    return { kind: 'assumption', named: named.assumption };
  }
  const falsifier = named.falsifiers.find((line) => binds(passage, line).ok);
  if (falsifier) return { kind: 'falsifier', named: falsifier };
  const input = named.valuation.find((line) => binds(passage, line).ok);
  if (input) return { kind: 'valuation', named: input };
  const decision = named.decisions.find((line) => binds(passage, line).ok);
  if (decision) return { kind: 'decision', named: decision };
  return null;
};

const datedLabel = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const proposeWording = ({ prior, passage, event }) => {
  const stemText = clean(prior, 800).replace(/[.]+$/, '');
  const fact = clean(passage, 400).replace(/[.]+$/, '');
  const when = datedLabel(event.datedAt);
  if (!stemText || !fact) return '';
  return when ? `${stemText}. ${when}: ${fact}.` : `${stemText}. ${fact}.`;
};

const dependentsOf = (pageId, pages = []) => {
  const target = String(pageId || '');
  if (!target) return [];
  return (Array.isArray(pages) ? pages : [])
    .filter((page) => list(page?.judgment?.dependsOn).some((item) => String(item?.pageId) === target))
    .map((page) => ({
      pageId: id(page),
      claim: clean(page?.judgment?.currentJudgment, 280),
      note: clean(list(page?.judgment?.dependsOn).find((item) => String(item?.pageId) === target)?.note, 240)
    }))
    .filter((row) => row.pageId && row.claim);
};

const silence = (kind, extra = {}) => ({
  kind,
  preview: null,
  mutation: false,
  ...extra
});

const routeOne = ({ event, pages = [], seenIdentities = new Set(), now = new Date() } = {}) => {
  const shaped = event?.eventIdentity ? event : contractEvent(event, { now });
  if (shaped.quarantine || !shaped.accepted) {
    return silence('malformed', {
      quarantine: true,
      ui: 'silence',
      evaluationTrace: { reason: 'malformed', eventIdentity: shaped.eventIdentity || '' }
    });
  }
  if (seenIdentities.has(shaped.eventIdentity)) {
    return silence('duplicate', {
      canonicalEventId: shaped.id,
      ui: 'silence',
      evaluationTrace: { reason: 'duplicate', eventIdentity: shaped.eventIdentity }
    });
  }

  const boundPages = (Array.isArray(pages) ? pages : []).filter((page) => {
    if (shaped.affectedPageIds.includes(id(page))) return true;
    return heldClaimsOf(page).some((claim) => binds(shaped.passage, claim.text).ok);
  });
  if (!boundPages.length) {
    return silence('wrong_corpus', {
      message: 'No bound evidence',
      ui: 'silence',
      evaluationTrace: { reason: 'wrong_corpus' }
    });
  }

  const candidates = [];
  boundPages.forEach((page) => {
    heldClaimsOf(page).forEach((claim) => {
      const clock = lastAcceptedClock(claim, page);
      const fresh = freshness({ event: shaped, lastAcceptedAt: clock, now });
      const named = namedMaterial(page, claim);
      const hit = materialHit(shaped.passage, named);
      candidates.push({ page, claim, clock, fresh, named, hit });
    });
  });

  const stale = candidates.filter((row) => row.fresh.kind === 'stale');
  const live = candidates.filter((row) => row.fresh.kind !== 'stale');
  const material = live.filter((row) => row.hit);

  if (!live.length && stale.length) {
    return silence('stale', {
      age: stale[0].fresh.age,
      ui: 'aged',
      evaluationTrace: { reason: 'stale', age: stale[0].fresh.age }
    });
  }
  if (!material.length) {
    return silence('no_impact', {
      ui: 'quiet',
      evaluationTrace: { reason: 'no_impact', boundPages: boundPages.map((page) => id(page)) }
    });
  }
  if (material.length > 1) {
    const uniqueClaims = new Set(material.map((row) => `${id(row.page)}:${row.claim.claimId}`));
    if (uniqueClaims.size > 1) {
      return silence('ambiguous', {
        message: "Can't determine the effect",
        ui: 'silence',
        evaluationTrace: { reason: 'ambiguous', claimCount: uniqueClaims.size }
      });
    }
  }

  const picked = material[0];
  const prior = clean(picked.claim.text, 800);
  const proposed = proposeWording({ prior, passage: shaped.passage, event: shaped });
  if (!proposed || proposed === prior) {
    return silence('no_impact', {
      ui: 'quiet',
      evaluationTrace: { reason: 'unchanged_wording' }
    });
  }

  const dependents = dependentsOf(id(picked.page), pages);
  return {
    kind: 'material',
    mutation: false,
    preview: {
      eventId: shaped.id,
      eventClass: shaped.class,
      eventTitle: shaped.title,
      eventIdentity: shaped.eventIdentity,
      contentHash: shaped.contentHash,
      canonicalSourceId: shaped.canonicalSourceId,
      correctsEventId: shaped.correctsEventId,
      datedAt: shaped.datedAt,
      age: shaped.age,
      url: shaped.url,
      passage: shaped.passage,
      pageId: id(picked.page),
      claimId: String(picked.claim.claimId || ''),
      claim: prior,
      prior,
      proposed,
      reversible: true,
      hit: picked.hit,
      dependents,
      whatChanged: shaped.title || shaped.passage,
      whatItAffects: prior,
      whatINeed: 'Accept, narrow, preserve, reject, or defer.',
      passageHref: shaped.url || `/wiki/workspace?page=${encodeURIComponent(id(picked.page))}`,
      claimHref: `/judgment/${encodeURIComponent(id(picked.page))}`
    }
  };
};

const selectPaperConsequence = ({ events = [], pages = [], now = new Date() } = {}) => {
  const shaped = dedupeEvents((Array.isArray(events) ? events : []).map((row) => contractEvent(row, { now })))
    .filter((event) => event.accepted);
  const seen = new Set();
  let chosen = null;
  shaped.forEach((event) => {
    const routed = routeOne({ event, pages, seenIdentities: seen, now });
    seen.add(event.eventIdentity);
    if (!chosen && routed.kind === 'material') chosen = routed;
  });
  return chosen?.preview || null;
};

const receiptKey = ({ userId, eventId, claimId, action }) => `consequence:${userId}:${eventId}:${claimId}:${action}`;

const scheduleReviewAt = (now = new Date()) => new Date(now.getTime() + REVIEW_MS);

const disposeConsequence = async ({
  models = {},
  userId,
  preview,
  action,
  narrowedText = '',
  now = new Date()
} = {}) => {
  const selected = clean(action, 24).toLowerCase();
  if (!ACTIONS.includes(selected)) {
    const error = new Error('Choose accept, narrow, preserve, reject, or defer.');
    error.statusCode = 400;
    throw error;
  }
  if (!preview?.eventId || !preview?.pageId || !preview?.claimId) {
    const error = new Error('The consequence is incomplete.');
    error.statusCode = 400;
    throw error;
  }

  const page = await models.WikiPage.findOne({ _id: preview.pageId, userId });
  if (!page) {
    const error = new Error('Wiki page not found.');
    error.statusCode = 404;
    throw error;
  }

  const key = receiptKey({ userId, eventId: preview.eventId, claimId: preview.claimId, action: selected });
  const existing = models.NoeisReceipt?.findOne
    ? serializeStoredReceipt(await models.NoeisReceipt.findOne({ userId, receiptId: key }))
    : null;
  if (existing && TERMINAL.has(existing.status)) {
    return { receipt: existing, replay: true, preview, page: asPlain(page) };
  }

  const before = snapshotPage(page);
  const claim = findHeldClaim(page, preview.claimId) || ensureHeldClaim(page, { now, actorType: 'user', claimId: preview.claimId });
  const prior = clean(claim?.text || page?.judgment?.currentJudgment || preview.prior, 800);
  const proposed = selected === 'narrow'
    ? clean(narrowedText || preview.proposed, 800)
    : clean(preview.proposed, 800);
  const reviewAt = scheduleReviewAt(now);
  const status = {
    accept: 'accepted',
    narrow: 'narrowed',
    preserve: 'preserved',
    reject: 'rejected',
    defer: 'deferred'
  }[selected];

  if (MUTATING.has(selected) && claim && proposed && proposed !== prior) {
    claim.history = list(claim.history);
    claim.history.push({
      at: now,
      event: 'revised',
      action: 'revised',
      actorType: 'user',
      disposition: 'accepted',
      text: proposed,
      summary: selected === 'narrow' ? 'Narrowed after a consequence.' : 'Revised after a consequence.'
    });
    claim.text = proposed;
    claim.lastCheckedAt = now;
    claim.lastAcceptedEvidenceAt = preview.datedAt || now;
    if (typeof page.markModified === 'function') page.markModified('claims');
    page.judgment = {
      ...(asPlain(page.judgment) || {}),
      currentJudgment: proposed,
      lastReviewedAt: now,
      decisions: [
        ...list(page.judgment?.decisions).map(asPlain),
        {
          decisionId: `consequence-${preview.eventId}`,
          summary: selected === 'narrow' ? `Narrowed: ${proposed}` : `Changed what I hold: ${proposed}`,
          decidedAt: now,
          reviewAt,
          status: 'taken',
          createdBy: 'user'
        }
      ]
    };
    await page.save();
    await createWikiRevision({
      WikiRevision: models.WikiRevision,
      userId,
      page,
      before,
      reason: 'user_edit',
      actorType: 'user',
      summary: `Claim ${claim.claimId} ${selected} after consequence ${preview.eventId}.`,
      sourceEventId: preview.eventId
    });
  }

  const receipt = await persistNoeisReceipt({
    NoeisReceipt: models.NoeisReceipt,
    userId,
    receipt: {
      id: key,
      kind: 'consequence_disposition',
      source: 'morning_paper',
      sourceLabel: 'Morning paper',
      status,
      title: preview.eventTitle || 'Consequence',
      summary: MUTATING.has(selected) ? `${selected}: ${proposed}` : `${selected}: ${prior}`,
      provenance: {
        eventId: preview.eventId,
        eventIdentity: preview.eventIdentity,
        contentHash: preview.contentHash,
        correctsEventId: preview.correctsEventId || '',
        pageId: preview.pageId,
        claimId: preview.claimId,
        prior,
        proposed: MUTATING.has(selected) ? proposed : preview.proposed,
        passage: preview.passage,
        disposition: selected,
        dependentsPreviewed: list(preview.dependents).map((row) => row.pageId),
        dependentsMutated: [],
        reviewAt: MUTATING.has(selected) || selected === 'defer' ? reviewAt : null,
        resolvedAt: now
      },
      touched: [{ type: 'wiki_page', id: preview.pageId, title: clean(page.title, 240) }],
      nextAction: MUTATING.has(selected) || selected === 'defer'
        ? { type: 'open_judgment', id: preview.pageId, title: 'Return when the review comes due' }
        : null,
      completedAt: now,
      createdAt: now
    }
  });

  return {
    receipt,
    replay: false,
    preview: {
      ...preview,
      prior,
      proposed: MUTATING.has(selected) ? proposed : preview.proposed,
      disposition: selected,
      reviewAt
    },
    page: asPlain(page)
  };
};

const loadConsequenceEvents = async ({ userId, models = {}, since = null, limit = 24 } = {}) => {
  if (!models.WikiSourceEvent?.find) return [];
  const query = { userId, status: { $ne: 'ignored' } };
  if (since) query.createdAt = { $gt: new Date(since) };
  let eventQuery = models.WikiSourceEvent.find(query);
  eventQuery = eventQuery.sort?.({ createdAt: -1 }) || eventQuery;
  eventQuery = eventQuery.limit?.(Math.max(1, Math.min(Number(limit) || 24, 50))) || eventQuery;
  const rows = await (eventQuery.lean ? eventQuery.lean() : eventQuery) || [];
  return rows.filter((row) => {
    const shaped = contractEvent(row);
    return shaped.accepted || shaped.quarantine;
  });
};

module.exports = {
  ACTIONS,
  binds,
  disposeConsequence,
  loadConsequenceEvents,
  proposeWording,
  routeOne,
  selectPaperConsequence
};
