const crypto = require('crypto');
const { isWikiPageSurfaceEligible } = require('./wikiPageQualityGuard');
const { buildDecisionIndex } = require('./decisionIndexService');
const { assertClaimDispositionReplayReceipt } = require('./wikiClaimDispositionService');

const MOVEMENT_KINDS = Object.freeze([
  'claim_changed',
  'new_evidence',
  'contradiction',
  'question_answerable',
  'connection_formed',
  'decision_due',
  'outcome_due',
  'outcome_reviewed'
]);
const MATERIALITY_RANK = Object.freeze({
  critical: 0,
  major: 1,
  supporting: 2
});
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const QUERY_MULTIPLIER = 8;

const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const id = value => String(value?._id || value || '');
const clean = (value = '', limit = 500) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, Math.max(1, limit - 1)).trim()}…` : text;
};
const stringIds = values => Array.from(new Set((Array.isArray(values) ? values : [])
  .map(id)
  .filter(Boolean)))
  .sort();
const sameIds = (left, right) => JSON.stringify(stringIds(left)) === JSON.stringify(stringIds(right));
const addedIds = (before, after) => {
  const previous = new Set(stringIds(before));
  return stringIds(after).filter(value => !previous.has(value));
};
const activeClaim = claim => (
  claim
  && claim.checkInStatus !== 'retired'
  && !claim.retiredAt
  && claim.materiality !== 'context'
);
const claimMap = claims => new Map((Array.isArray(claims) ? claims : [])
  .filter(claim => claim?.claimId)
  .map(claim => [String(claim.claimId), plain(claim)]));

const safeUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return raw;
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch (_error) {
    return '';
  }
};

const privateIpv4 = hostname => {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224;
};

const privateMappedIpv6 = hostname => {
  if (!hostname.startsWith('::ffff:')) return false;
  const suffix = hostname.slice('::ffff:'.length);
  if (suffix.includes('.')) return privateIpv4(suffix);
  const groups = suffix.split(':');
  if (groups.length !== 2 || groups.some(group => !/^[0-9a-f]{1,4}$/i.test(group))) return false;
  const high = Number.parseInt(groups[0], 16);
  const low = Number.parseInt(groups[1], 16);
  return privateIpv4([
    high >> 8,
    high & 255,
    low >> 8,
    low & 255
  ].join('.'));
};

const safePublicUrl = (value = '') => {
  const normalized = safeUrl(value);
  if (!normalized || normalized.startsWith('/')) return '';
  try {
    const parsed = new URL(normalized);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (parsed.username || parsed.password) return '';
    if (!hostname
      || hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname.endsWith('.local')
      || hostname.endsWith('.internal')
      || privateIpv4(hostname)
      || privateMappedIpv6(hostname)
      || hostname === '::'
      || hostname === '::1'
      || hostname.startsWith('fc')
      || hostname.startsWith('fd')
      || hostname.startsWith('fe8')
      || hostname.startsWith('fe9')
      || hostname.startsWith('fea')
      || hostname.startsWith('feb')) return '';
    return normalized;
  } catch (_error) {
    return '';
  }
};

const stableHash = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);

const sourceFingerprint = event => {
  const sourceIdentity = clean(
    event.externalId
      || id(event.sourceObjectId)
      || safeUrl(event.url)
      || id(event),
    1000
  );
  return [
    clean(event.provider, 120),
    clean(event.sourceType, 80),
    sourceIdentity,
    clean(event.eventType, 80),
    validDate(event.sourceUpdatedAt)?.toISOString() || ''
  ].join('|');
};

const movementId = ({ kind, pageId, claimId, event }) => (
  `movement_${stableHash(['v1', kind, pageId, claimId, sourceFingerprint(event)].join('|'))}`
);
const movementEpisodeId = ({ pageId, revisionId, reviewState }) => (
  `knowledge_episode:v1:${id(pageId)}:${id(revisionId)}:${reviewState}`
);
const decisionDueMovementId = ({ pageId, decisionId, reviewAt }) => (
  `movement_${stableHash(['v1', 'decision_due', pageId, decisionId, reviewAt].join('|'))}`
);
const outcomeDueMovementId = ({ pageId, decisionId, outcomeDueAt }) => (
  `movement_${stableHash(['v1', 'outcome_due', pageId, decisionId, outcomeDueAt].join('|'))}`
);
const outcomeReviewedMovementId = receiptId => (
  `movement_${stableHash(['v1', 'outcome_reviewed', receiptId].join('|'))}`
);
const questionAnswerableMovementId = ({ eventId, questionId, candidateId }) => (
  `movement_${stableHash(['v1', 'question_answerable', eventId, questionId, candidateId].join('|'))}`
);
const connectionFormedMovementId = receiptId => (
  `movement_${stableHash(['v1', 'connection_formed', receiptId].join('|'))}`
);

const validDate = value => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const connectionReceiptTouchesExactEndpoints = (receipt, provenance) => {
  const touched = Array.isArray(receipt?.touched) ? receipt.touched : [];
  const expected = [
    `${clean(provenance?.fromType, 80)}:${id(provenance?.fromId)}`,
    `${clean(provenance?.toType, 80)}:${id(provenance?.toId)}`
  ].sort();
  const actual = touched
    .map(entry => `${clean(entry?.type, 80)}:${id(entry?.id)}`)
    .filter(value => !value.endsWith(':'))
    .sort();
  return expected.every(Boolean)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
};

const pageHref = pageId => `/wiki/workspace?page=${encodeURIComponent(pageId)}`;
const claimHref = (pageId, claimId) => (
  `${pageHref(pageId)}&claimId=${encodeURIComponent(claimId)}`
);
const conceptHref = conceptName => (
  `/think?tab=concepts&concept=${encodeURIComponent(conceptName)}`
);

const wikiPageRef = page => {
  const pageId = id(page);
  return {
    type: 'wiki_page',
    id: pageId,
    title: clean(page.title || 'Untitled wiki page', 180),
    href: pageHref(pageId)
  };
};

const wikiClaimRef = ({ page, claim }) => ({
  type: 'wiki_claim',
  id: String(claim.claimId),
  parentId: id(page),
  title: clean(claim.text || 'Untitled claim', 260),
  href: claimHref(id(page), claim.claimId)
});

const internalHrefForSource = ({ type, objectId, title, fallbackHref }) => {
  if (type === 'article') return `/library?articleId=${encodeURIComponent(objectId)}`;
  if (type === 'highlight') return `/library?highlightId=${encodeURIComponent(objectId)}`;
  if (type === 'notebook' || type === 'note') {
    return `/think?tab=notebook&entryId=${encodeURIComponent(objectId)}`;
  }
  if (type === 'concept') return conceptHref(title || objectId);
  if (type === 'question') return `/think?tab=questions&questionId=${encodeURIComponent(objectId)}`;
  return fallbackHref;
};

const sourceRefToKnowledgeRef = ({ sourceRef, fallbackHref }) => {
  const ref = plain(sourceRef) || {};
  const rawType = clean(ref.type, 80);
  const type = rawType === 'notebook' ? 'note' : rawType;
  const objectId = id(ref.objectId) || id(ref._id);
  const title = clean(ref.title || ref.citationLabel || 'Source evidence', 220);
  return {
    type: ['article', 'highlight', 'note', 'concept', 'question'].includes(type) ? type : 'note',
    id: objectId,
    parentId: id(ref.parentObjectId) || undefined,
    title,
    href: internalHrefForSource({
      type: rawType,
      objectId,
      title,
      fallbackHref
    }),
    sourceUrl: safeUrl(ref.url) || undefined
  };
};

const sourceEventRef = ({ event, fallbackHref }) => {
  const rawType = clean(event.sourceType, 80);
  const type = rawType === 'notebook' ? 'note' : rawType;
  const objectId = id(event.sourceObjectId) || clean(event.externalId, 240) || id(event);
  const title = clean(event.title || event.summary || 'Source evidence', 220);
  return {
    type: ['article', 'highlight', 'note', 'concept', 'question'].includes(type) ? type : 'note',
    id: objectId,
    parentId: id(event),
    title,
    href: internalHrefForSource({
      type: rawType,
      objectId,
      title,
      fallbackHref
    }),
    sourceUrl: safeUrl(event.url) || undefined
  };
};

const visibleOwned = (value, userId) => Boolean(
  value
  && id(value.userId) === id(userId)
  && value.status !== 'archived'
  && value.archived !== true
  && value.hiddenFromHome !== true
  && value.debugOnly !== true
);
const eligibleExternalEvent = (event, userId) => Boolean(
  visibleOwned(event, userId)
  && clean(event?.sourceType, 40) === 'external'
  && clean(event?.provider, 120)
  && clean(event?.externalId, 500)
  && safePublicUrl(event?.url)
);

const resolveQuestionEvidenceEvents = async ({ userId, models, events }) => {
  const supported = new Set(['article', 'highlight', 'notebook', 'concept', 'question']);
  const eligible = events.filter(event => supported.has(clean(event.sourceType, 40)) && id(event.sourceObjectId));
  const idsByType = new Map();
  eligible.forEach(event => {
    const type = clean(event.sourceType, 40);
    if (!idsByType.has(type)) idsByType.set(type, []);
    idsByType.get(type).push(id(event.sourceObjectId));
  });
  const resolved = new Set();
  const collect = async (type, model, query) => {
    if (!idsByType.get(type)?.length || !model?.find) return;
    let cursor = model.find(query);
    cursor = cursor.select?.('_id userId status archived hiddenFromHome debugOnly highlights._id') || cursor;
    cursor = cursor.lean?.() || cursor;
    (await cursor || []).map(plain).filter(row => visibleOwned(row, userId)).forEach(row => {
      if (type === 'highlight') {
        (Array.isArray(row.highlights) ? row.highlights : []).forEach(highlight => {
          if (idsByType.get(type).includes(id(highlight))) resolved.add(`${type}:${id(highlight)}`);
        });
      } else if (idsByType.get(type).includes(id(row))) resolved.add(`${type}:${id(row)}`);
    });
  };
  await Promise.all([
    collect('article', models.Article, { userId, _id: { $in: idsByType.get('article') || [] } }),
    collect('highlight', models.Article, { userId, 'highlights._id': { $in: idsByType.get('highlight') || [] } }),
    collect('notebook', models.NotebookEntry, { userId, _id: { $in: idsByType.get('notebook') || [] } }),
    collect('concept', models.TagMeta, { userId, _id: { $in: idsByType.get('concept') || [] } }),
    collect('question', models.Question, { userId, _id: { $in: idsByType.get('question') || [] } })
  ]);
  return new Set(eligible
    .filter(event => resolved.has(`${clean(event.sourceType, 40)}:${id(event.sourceObjectId)}`))
    .map(event => id(event)));
};

const resolveClaimEvidenceEvents = async ({ userId, models, events }) => {
  const internallyResolved = await resolveQuestionEvidenceEvents({ userId, models, events });
  const externallyResolved = events.filter(event => (
    eligibleExternalEvent(event, userId)
  )).map(event => id(event));
  return new Set([...internallyResolved, ...externallyResolved]);
};

const buildQuestionAnswerableMovements = async ({ userId, models, since, limit }) => {
  if (!models.WikiSourceEvent?.find || !models.Question?.find || !models.Connection?.find) return [];
  const eventQuery = {
    userId,
    status: 'processed',
    'metadata.candidateUpdates.status': 'accepted',
    'metadata.ingestReviewedAt': { $ne: null }
  };
  if (since) eventQuery['metadata.ingestReviewedAt'] = { $gt: new Date(since) };
  let cursor = models.WikiSourceEvent.find(eventQuery);
  cursor = cursor.sort?.({ 'metadata.ingestReviewedAt': -1 }) || cursor;
  cursor = cursor.limit?.(Math.min(Math.max(limit * QUERY_MULTIPLIER, limit), 100)) || cursor;
  cursor = cursor.lean?.() || cursor;
  const events = (await cursor || []).map(plain).filter(event => (
    visibleOwned(event, userId) && event.status === 'processed'
  ));
  const candidates = events.flatMap(event => (
    Array.isArray(event.metadata?.candidateUpdates) ? event.metadata.candidateUpdates : []
  ).filter(candidate => {
    const reviewedAt = candidate?.reviewedAt;
    const trace = candidate?.graphTrace;
    return candidate?.targetType === 'question'
      && candidate?.status === 'accepted'
      && candidate?.reviewAction === 'accept'
      && candidate?.id
      && candidate?.objectId
      && reviewedAt
      && (!since || new Date(reviewedAt) > new Date(since))
      && trace?.bidirectional === true
      && trace?.source?.type === event.sourceType
      && id(trace?.source?.id) === id(event.sourceObjectId)
      && trace?.target?.type === 'question'
      && id(trace?.target?.id) === id(candidate.objectId)
      && trace?.forwardId
      && trace?.reciprocalId;
  }).map(candidate => ({ event, candidate })));
  if (!candidates.length) return [];

  const questionIds = stringIds(candidates.map(row => row.candidate.objectId));
  let questionsQuery = models.Question.find({
    userId,
    _id: { $in: questionIds },
    status: 'open',
    archived: { $ne: true },
    hiddenFromHome: { $ne: true },
    debugOnly: { $ne: true }
  });
  questionsQuery = questionsQuery.lean?.() || questionsQuery;
  const questions = (await questionsQuery || []).map(plain).filter(question => (
    visibleOwned(question, userId) && question.status === 'open' && questionIds.includes(id(question))
  ));
  const questionById = new Map(questions.map(question => [id(question), question]));

  const connectionIds = stringIds(candidates.flatMap(row => [
    row.candidate.graphTrace.forwardId,
    row.candidate.graphTrace.reciprocalId
  ]));
  let connectionsQuery = models.Connection.find({ userId, _id: { $in: connectionIds } });
  connectionsQuery = connectionsQuery.lean?.() || connectionsQuery;
  const connections = (await connectionsQuery || []).map(plain).filter(row => (
    id(row.userId) === id(userId) && connectionIds.includes(id(row))
  ));
  const connectionById = new Map(connections.map(row => [id(row), row]));
  const resolvedEventIds = await resolveQuestionEvidenceEvents({
    userId,
    models,
    events: candidates.map(row => row.event)
  });

  return candidates.map(({ event, candidate }) => {
    const question = questionById.get(id(candidate.objectId));
    const trace = candidate.graphTrace;
    const forward = connectionById.get(id(trace.forwardId));
    const reciprocal = connectionById.get(id(trace.reciprocalId));
    const exactPair = forward && reciprocal
      && forward.fromType === trace.source.type && id(forward.fromId) === id(trace.source.id)
      && forward.toType === 'question' && id(forward.toId) === id(question)
      && reciprocal.fromType === 'question' && id(reciprocal.fromId) === id(question)
      && reciprocal.toType === trace.source.type && id(reciprocal.toId) === id(trace.source.id)
      && forward.relationType === trace.relationType
      && reciprocal.relationType === trace.reciprocalRelationType;
    if (!question || !exactPair || !resolvedEventIds.has(id(event))) return null;
    const questionRef = {
      type: 'question',
      id: id(question),
      title: clean(question.text || question.title || 'Open question', 240),
      href: `/think?tab=questions&questionId=${encodeURIComponent(id(question))}`
    };
    const reviewedAt = new Date(candidate.reviewedAt).toISOString();
    return {
      id: questionAnswerableMovementId({
        eventId: id(event), questionId: id(question), candidateId: candidate.id
      }),
      episodeId: `question_episode:v1:${id(event)}:${id(question)}`,
      kind: 'question_answerable',
      occurredAt: reviewedAt,
      title: `New accepted evidence is ready to review for ${questionRef.title}`,
      whyItMatters: 'You accepted this source as relevant to an open question. Noeis has not inferred that the question is answered.',
      materiality: 'supporting',
      reviewState: 'current',
      subject: questionRef,
      evidence: [sourceEventRef({ event, fallbackHref: questionRef.href })],
      affected: [questionRef],
      unresolved: [questionRef],
      nextAction: {
        label: 'Review question',
        href: questionRef.href,
        intent: 'review_question'
      },
      provenance: {
        eventIds: [id(event)],
        revisionIds: [],
        deterministicFacts: [
          `Human accepted source-question relevance at ${reviewedAt}`,
          `Source: ${clean(event.sourceType, 40)}:${id(event.sourceObjectId)}`,
          'Question status: open'
        ]
      }
    };
  }).filter(Boolean);
};

const awaitLeanOne = async query => {
  if (!query) return null;
  const selected = query.select?.('_id userId title name text status archived hiddenFromHome debugOnly highlights claims aiState') || query;
  const lean = selected.lean?.() || selected;
  return plain(await lean);
};

const resolveOwnedKnowledgeRef = async ({ userId, type, objectId, models }) => {
  const safeType = clean(type, 40);
  const safeId = id(objectId);
  if (!safeId) return null;
  let row = null;
  let title = '';
  let href = '';
  if (safeType === 'article') {
    row = await awaitLeanOne(models.Article?.findOne?.({ _id: safeId, userId }));
    title = row?.title;
    href = `/library?articleId=${encodeURIComponent(safeId)}`;
  } else if (safeType === 'highlight') {
    row = await awaitLeanOne(models.Article?.findOne?.({ userId, 'highlights._id': safeId }));
    const highlight = (Array.isArray(row?.highlights) ? row.highlights : []).find(item => id(item) === safeId);
    if (!highlight) return null;
    title = highlight.text || row.title;
    href = `/library?highlightId=${encodeURIComponent(safeId)}`;
  } else if (safeType === 'notebook' || safeType === 'note') {
    row = await awaitLeanOne(models.NotebookEntry?.findOne?.({ _id: safeId, userId }));
    title = row?.title || row?.text;
    href = `/think?tab=notebook&entryId=${encodeURIComponent(safeId)}`;
  } else if (safeType === 'concept') {
    row = await awaitLeanOne(models.TagMeta?.findOne?.({ _id: safeId, userId }));
    title = row?.name;
    href = conceptHref(title || safeId);
  } else if (safeType === 'question') {
    row = await awaitLeanOne(models.Question?.findOne?.({ _id: safeId, userId }));
    title = row?.text;
    href = `/think?tab=questions&questionId=${encodeURIComponent(safeId)}`;
  } else if (safeType === 'wiki_page') {
    row = await awaitLeanOne(models.WikiPage?.findOne?.({ _id: safeId, userId }));
    if (row && !isWikiPageSurfaceEligible(row)) return null;
    title = row?.title;
    href = pageHref(safeId);
  } else if (safeType === 'wiki_claim') {
    const separator = safeId.indexOf(':');
    if (separator < 1) return null;
    const pageId = safeId.slice(0, separator);
    const claimId = safeId.slice(separator + 1);
    row = await awaitLeanOne(models.WikiPage?.findOne?.({ _id: pageId, userId, 'claims.claimId': claimId }));
    if (row && !isWikiPageSurfaceEligible(row)) return null;
    const claim = (Array.isArray(row?.claims) ? row.claims : []).find(item => String(item?.claimId) === claimId);
    if (!claim) return null;
    title = claim.text;
    href = claimHref(pageId, claimId);
    if (visibleOwned(row, userId)) {
      return { type: safeType, id: claimId, parentId: pageId, title: clean(title, 240), href };
    }
  } else {
    return null;
  }
  if (!visibleOwned(row, userId)) return null;
  return { type: safeType === 'notebook' ? 'note' : safeType, id: safeId, title: clean(title || safeType, 240), href };
};

const resolveDurableMovementEvidence = async ({ movement, userId, models, event }) => {
  // External identities belong to the durable WikiSourceEvent. They are not
  // Mongo ObjectIds for Article/Notebook models and must never enter those
  // internal-source lookup paths.
  if (clean(event?.sourceType, 40) === 'external') {
    return eligibleExternalEvent(event, userId)
      ? [sourceEventRef({ event, fallbackHref: movement?.subject?.href || '' })]
      : [];
  }
  const durable = [];
  for (const evidence of Array.isArray(movement?.evidence) ? movement.evidence : []) {
    const resolved = await resolveOwnedKnowledgeRef({
      userId,
      type: evidence?.type,
      objectId: evidence?.id,
      models
    });
    if (!resolved) continue;
    durable.push({
      ...resolved,
      title: clean(evidence?.title || resolved.title, 220),
      ...(evidence?.sourceUrl ? { sourceUrl: evidence.sourceUrl } : {})
    });
  }
  if (durable.length) {
    return Array.from(new Map(durable.map(ref => [`${ref.type}:${ref.id}`, ref])).values());
  }
  return [sourceEventRef({ event, fallbackHref: movement?.subject?.href || '' })];
};

const buildConnectionFormedMovements = async ({ userId, models, since, limit }) => {
  if (!models.NoeisReceipt?.find || !models.Connection?.find) return [];
  const receiptQuery = { userId, kind: 'connection_created', status: 'completed' };
  if (since) receiptQuery.completedAt = { $gt: new Date(since) };
  let receiptsQuery = models.NoeisReceipt.find(receiptQuery);
  receiptsQuery = receiptsQuery.sort?.({ completedAt: -1 }) || receiptsQuery;
  receiptsQuery = receiptsQuery.limit?.(Math.min(Math.max(limit * QUERY_MULTIPLIER, limit), 100)) || receiptsQuery;
  receiptsQuery = receiptsQuery.lean?.() || receiptsQuery;
  const receipts = (await receiptsQuery || []).map(plain).filter(receipt => (
    id(receipt.userId) === id(userId)
    && receipt.kind === 'connection_created'
    && receipt.source === 'connections'
    && receipt.status === 'completed'
    && receipt.receiptId
    && id(receipt)
    && validDate(receipt.completedAt)
    && (!since || validDate(receipt.completedAt) > new Date(since))
  ));
  if (!receipts.length) return [];
  const connectionIds = stringIds(receipts.flatMap(receipt => [
    receipt.provenance?.forwardConnectionId,
    receipt.provenance?.reciprocalConnectionId
  ]));
  let connectionQuery = models.Connection.find({ userId, _id: { $in: connectionIds } });
  connectionQuery = connectionQuery.lean?.() || connectionQuery;
  const connections = (await connectionQuery || []).map(plain).filter(row => id(row.userId) === id(userId));
  const byId = new Map(connections.map(row => [id(row), row]));
  const movements = [];
  for (const receipt of receipts) {
    const provenance = receipt.provenance || {};
    const forward = byId.get(id(provenance.forwardConnectionId));
    const reciprocal = byId.get(id(provenance.reciprocalConnectionId));
    const exact = forward && reciprocal
      && provenance.version === 1
      && receipt.receiptId === `connection_created:v1:${id(provenance.forwardConnectionId)}`
      && connectionReceiptTouchesExactEndpoints(receipt, provenance)
      && forward.fromType === provenance.fromType && id(forward.fromId) === id(provenance.fromId)
      && forward.toType === provenance.toType && id(forward.toId) === id(provenance.toId)
      && forward.relationType === provenance.relationType
      && reciprocal.fromType === provenance.toType && id(reciprocal.fromId) === id(provenance.toId)
      && reciprocal.toType === provenance.fromType && id(reciprocal.toId) === id(provenance.fromId)
      && reciprocal.relationType === provenance.reciprocalRelationType
      && String(forward.scopeType || '') === String(provenance.scopeType || '')
      && id(forward.scopeId) === id(provenance.scopeId)
      && String(reciprocal.scopeType || '') === String(provenance.scopeType || '')
      && id(reciprocal.scopeId) === id(provenance.scopeId);
    if (!exact || provenance.actorType !== 'user') continue;
    const [fromRef, toRef] = await Promise.all([
      resolveOwnedKnowledgeRef({ userId, type: provenance.fromType, objectId: provenance.fromId, models }),
      resolveOwnedKnowledgeRef({ userId, type: provenance.toType, objectId: provenance.toId, models })
    ]);
    if (!fromRef || !toRef) continue;
    const completedAt = validDate(receipt.completedAt).toISOString();
    movements.push({
      id: connectionFormedMovementId(receipt.receiptId),
      episodeId: `connection_episode:v1:${receipt.receiptId}`,
      kind: 'connection_formed',
      occurredAt: completedAt,
      title: `${fromRef.title} was connected to ${toRef.title}`,
      whyItMatters: `You explicitly connected these objects as ${clean(provenance.relationType, 60).replace(/_/g, ' ')}.`,
      materiality: 'supporting',
      reviewState: 'current',
      subject: fromRef,
      evidence: ['supports', 'contradicts'].includes(provenance.relationType) ? [fromRef] : [],
      affected: [toRef],
      unresolved: [],
      nextAction: { label: 'Open connected object', href: toRef.href, intent: 'open_connection' },
      provenance: {
        eventIds: [id(receipt)],
        revisionIds: [],
        deterministicFacts: [
          `Human-created connection at ${completedAt}`,
          `Relation: ${clean(provenance.relationType, 60)}`,
          `Endpoints: ${provenance.fromType}:${id(provenance.fromId)} → ${provenance.toType}:${id(provenance.toId)}`
        ]
      }
    });
  }
  return movements;
};

const conceptRefForPage = (page, conceptById = new Map(), conceptByPageId = new Map()) => {
  const createdFrom = plain(page.createdFrom) || {};
  const legacyConcept = createdFrom.type === 'concept'
    ? conceptById.get(id(createdFrom.objectId))
    : null;
  const anchoredConcept = conceptByPageId.get(id(page)) || null;
  if (legacyConcept && anchoredConcept && id(legacyConcept) !== id(anchoredConcept)) return null;
  const concept = legacyConcept || anchoredConcept;
  if (!concept) return null;
  const conceptName = clean(concept.name, 180);
  return {
    type: 'concept',
    id: id(concept),
    title: conceptName,
    href: conceptHref(conceptName)
  };
};

const conceptInvestigationHref = ({ concept, page, revision, claimId }) => {
  if (!concept?.id || !concept?.title || !id(page) || !id(revision)) return '';
  const params = new URLSearchParams({
    tab: 'concepts',
    concept: concept.title,
    conceptId: concept.id,
    investigation: '1',
    wikiPageId: id(page),
    revisionId: id(revision)
  });
  if (claimId) params.set('claimId', String(claimId));
  return `/think?${params.toString()}`;
};

const pageScopedInvestigationAction = nextAction => {
  if (!['investigate_movement', 'start_investigation'].includes(nextAction?.intent) || !nextAction?.href) {
    return nextAction;
  }
  const [path, rawQuery = ''] = String(nextAction.href).split('?');
  const params = new URLSearchParams(rawQuery);
  params.delete('claimId');
  const scoped = { ...nextAction, href: `${path}?${params.toString()}` };
  delete scoped.claimId;
  return scoped;
};

const diffClaimState = (revision = {}) => {
  const before = claimMap(revision.before?.claims);
  const after = claimMap(revision.after?.claims);
  const rows = [];

  for (const [claimId, next] of after.entries()) {
    const previous = before.get(claimId);
    if (!activeClaim(next)) continue;

    const beforeSupport = String(previous?.support || 'untracked');
    const afterSupport = String(next.support || 'unsupported');
    const beforeEpistemicStatus = String(previous?.epistemicStatus || 'untracked');
    const afterEpistemicStatus = String(next.epistemicStatus || 'plausible_hypothesis');
    const textChanged = Boolean(previous && clean(previous.text, 2000) !== clean(next.text, 2000));
    const supportChanged = beforeSupport !== afterSupport;
    const epistemicStatusChanged = beforeEpistemicStatus !== afterEpistemicStatus;
    const newSourceRefIds = addedIds(previous?.sourceRefIds, next.sourceRefIds);
    const newCitationIds = addedIds(previous?.citationIds, next.citationIds);
    const newContradictedByCitationIds = addedIds(
      previous?.contradictedByCitationIds,
      next.contradictedByCitationIds
    );
    const evidenceChanged = (
      !sameIds(previous?.sourceRefIds, next.sourceRefIds)
      || !sameIds(previous?.citationIds, next.citationIds)
      || !sameIds(previous?.contradictedByCitationIds, next.contradictedByCitationIds)
    );
    const evidenceAdded = (
      newSourceRefIds.length
      + newCitationIds.length
      + newContradictedByCitationIds.length
    ) > 0;
    const becameConflicted = afterSupport === 'conflicted' && beforeSupport !== 'conflicted';
    const contradiction = becameConflicted || newContradictedByCitationIds.length > 0;

    if (!previous || textChanged || supportChanged || epistemicStatusChanged || evidenceChanged) {
      rows.push({
        claimId,
        claim: next,
        previous,
        beforeSupport,
        afterSupport,
        beforeEpistemicStatus,
        afterEpistemicStatus,
        textChanged,
        supportChanged,
        epistemicStatusChanged,
        evidenceChanged,
        evidenceAdded,
        contradiction,
        newSourceRefIds,
        newCitationIds,
        newContradictedByCitationIds
      });
    }
  }
  return rows;
};

const hasHumanAcceptedDisposition = ({ revision, acceptedRevisionIds = new Set() }) => (
  acceptedRevisionIds.has(id(revision))
  || (revision?.actorType === 'user' && revision?.reason === 'user_edit')
);

const acceptanceReceiptRevisionId = receipt => {
  if (receipt?.kind === 'wiki_claim_disposition') {
    return receipt?.provenance?.action === 'accept' ? id(receipt?.provenance?.revisionId) : '';
  }
  return id(receipt?.provenance?.candidateRevisionId);
};

const kindForImpact = ({ impact, revision, acceptedRevisionIds }) => {
  const currentHumanRevision = revision?.promotionStatus === 'promoted'
    && hasHumanAcceptedDisposition({ revision, acceptedRevisionIds });
  if (impact.contradiction) {
    return revision?.promotionStatus === 'candidate' || currentHumanRevision ? 'contradiction' : '';
  }
  if (
    currentHumanRevision
    && (impact.textChanged || impact.supportChanged || impact.epistemicStatusChanged || !impact.previous)
  ) return 'claim_changed';
  if (impact.evidenceAdded && (revision?.promotionStatus === 'candidate' || currentHumanRevision)) {
    return 'new_evidence';
  }
  return '';
};

const materialityFor = impact => (
  ['critical', 'major', 'supporting'].includes(impact.claim?.materiality)
    ? impact.claim.materiality
    : 'supporting'
);

const titleFor = ({ kind, page, claim }) => {
  const pageTitle = clean(page.title || 'this page', 160);
  if (kind === 'contradiction') return `New evidence challenges a claim in ${pageTitle}`;
  if (kind === 'claim_changed') return `A reviewed claim changed in ${pageTitle}`;
  return `New evidence was attached to ${pageTitle}`;
};

const whyFor = ({ kind, page, impact, reviewState }) => {
  const pageTitle = clean(page.title || 'this Wiki page', 160);
  if (kind === 'contradiction') {
    return reviewState === 'candidate'
      ? `A proposed analysis found evidence that conflicts with a ${materialityFor(impact)} claim on ${pageTitle}. Your accepted view has not changed.`
      : `Evidence in the current Wiki now conflicts with a ${materialityFor(impact)} claim on ${pageTitle}.`;
  }
  if (kind === 'claim_changed') {
    return `An explicitly accepted revision changed the wording, support, or epistemic status of a ${materialityFor(impact)} claim on ${pageTitle}.`;
  }
  return reviewState === 'candidate'
    ? `A proposed revision attached new evidence to a ${materialityFor(impact)} claim on ${pageTitle}. It still requires review.`
    : `The current Wiki revision attached new evidence to a ${materialityFor(impact)} claim on ${pageTitle}.`;
};

const deterministicFactsFor = ({ impact, reviewState, event, evidenceCount = 0 }) => {
  const facts = [
    `Revision state: ${reviewState}`,
    `Claim materiality: ${materialityFor(impact)}`,
    `Support: ${impact.beforeSupport} → ${impact.afterSupport}`
  ];
  if (impact.textChanged) facts.push('Claim text changed');
  if (impact.epistemicStatusChanged) {
    facts.push(`Epistemic status: ${impact.beforeEpistemicStatus} → ${impact.afterEpistemicStatus}`);
  }
  if (evidenceCount) facts.push(`${evidenceCount} new evidence reference${evidenceCount === 1 ? '' : 's'}`);
  const sourceDate = validDate(event.sourceUpdatedAt);
  if (sourceDate) facts.push(`Source dated ${sourceDate.toISOString()}`);
  return facts;
};

const exactEvidenceRefs = ({ revision, impact, fallbackHref, event }) => {
  const sourceRefs = Array.isArray(revision.after?.sourceRefs) ? revision.after.sourceRefs.map(plain) : [];
  const citations = Array.isArray(revision.after?.citations) ? revision.after.citations.map(plain) : [];
  const sourceById = new Map(sourceRefs.map(ref => [id(ref), ref]));
  const citationById = new Map(citations.map(citation => [id(citation), citation]));
  const wantedSourceIds = new Set(impact.newSourceRefIds);
  const directCitationRefs = [];

  [...impact.newCitationIds, ...impact.newContradictedByCitationIds].forEach(citationId => {
    const citation = citationById.get(citationId);
    if (!citation) return;
    if (citation.sourceRefId) {
      wantedSourceIds.add(id(citation.sourceRefId));
      return;
    }
    if (!citation.sourceObjectId) return;
    directCitationRefs.push(sourceRefToKnowledgeRef({
      sourceRef: {
        _id: citation._id,
        type: citation.sourceType,
        objectId: citation.sourceObjectId,
        title: citation.sourceTitle,
        url: citation.url
      },
      fallbackHref
    }));
  });

  const resolved = Array.from(wantedSourceIds)
    .map(sourceId => sourceById.get(sourceId))
    .filter(Boolean)
    .map(sourceRef => sourceRefToKnowledgeRef({ sourceRef, fallbackHref }))
    .concat(directCitationRefs);
  if (resolved.length) {
    return Array.from(new Map(resolved.map(ref => [`${ref.type}:${ref.id}`, ref])).values());
  }
  return [sourceEventRef({ event, fallbackHref })];
};

const buildMovement = ({
  event,
  revision,
  page,
  impact,
  conceptById,
  conceptByPageId = new Map(),
  acceptedRevisionIds,
  acceptedAtByRevisionId = new Map()
}) => {
  const reviewState = revision.promotionStatus === 'promoted' ? 'current' : 'candidate';
  const kind = kindForImpact({ impact, revision, acceptedRevisionIds });
  if (!MOVEMENT_KINDS.includes(kind)) return null;
  if (kind === 'claim_changed' && reviewState !== 'current') return null;

  const pageReference = wikiPageRef(page);
  const claimReference = wikiClaimRef({ page, claim: impact.claim });
  const conceptReference = conceptRefForPage(page, conceptById, conceptByPageId);
  const occurredAt = acceptedAtByRevisionId.get(id(revision))
    || revision.createdAt
    || event.processedAt
    || event.createdAt
    || null;
  const unresolved = reviewState === 'candidate' || kind === 'contradiction'
    ? [claimReference]
    : [];
  const evidence = exactEvidenceRefs({
    revision,
    impact,
    fallbackHref: claimReference.href,
    event
  });
  const investigationHref = conceptInvestigationHref({
    concept: conceptReference,
    page,
    revision,
    claimId: impact.claimId
  });

  return {
    id: movementId({ kind, pageId: id(page), claimId: impact.claimId, event }),
    episodeId: movementEpisodeId({
      pageId: id(page),
      revisionId: id(revision),
      reviewState
    }),
    kind,
    occurredAt,
    title: titleFor({ kind, page, claim: impact.claim }),
    whyItMatters: whyFor({ kind, page, impact, reviewState }),
    materiality: materialityFor(impact),
    reviewState,
    subject: claimReference,
    evidence,
    affected: [pageReference, ...(conceptReference ? [conceptReference] : [])],
    unresolved,
    nextAction: investigationHref
      ? {
        label: 'Investigate in Think',
        href: investigationHref,
        intent: 'investigate_movement'
      }
      : {
        label: 'Start investigation',
        href: claimReference.href,
        intent: 'start_investigation',
        wikiPageId: id(page),
        revisionId: id(revision),
        claimId: impact.claimId
      },
    provenance: {
      eventIds: [id(event)],
      revisionIds: [id(revision)],
      deterministicFacts: deterministicFactsFor({
        impact,
        reviewState,
        event,
        evidenceCount: evidence.length
      })
    }
  };
};

const uniqueKnowledgeRefs = values => {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter(value => {
    const key = `${value?.type || ''}:${id(value?.id)}:${id(value?.parentId)}`;
    if (!value?.type || !value?.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const EPISODE_KIND_RANK = { contradiction: 0, claim_changed: 1, new_evidence: 2 };
const episodeStrength = movement => [
  MATERIALITY_RANK[movement?.materiality] ?? 99,
  EPISODE_KIND_RANK[movement?.kind] ?? 99,
  movement?.reviewState === 'candidate' ? 0 : 1,
  -(new Date(movement?.occurredAt || 0).getTime() || 0),
  String(movement?.id || '')
];
const compareEpisodeStrength = (left, right) => {
  const leftRank = episodeStrength(left);
  const rightRank = episodeStrength(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] < rightRank[index]) return -1;
    if (leftRank[index] > rightRank[index]) return 1;
  }
  return 0;
};

const buildKnowledgeMovementEpisodes = (movements = []) => {
  const grouped = new Map();
  (Array.isArray(movements) ? movements : []).forEach(movement => {
    if (!movement?.id) return;
    const episodeId = movement.episodeId || movement.id;
    if (!grouped.has(episodeId)) grouped.set(episodeId, []);
    grouped.get(episodeId).push(movement);
  });

  return Array.from(grouped.entries()).map(([episodeId, members]) => {
    const ranked = [...members].sort(compareEpisodeStrength);
    const representative = ranked[0];
    const subjects = uniqueKnowledgeRefs(members.map(movement => movement.subject));
    const evidence = uniqueKnowledgeRefs(members.flatMap(movement => movement.evidence || []));
    const affected = uniqueKnowledgeRefs(members.flatMap(movement => movement.affected || []));
    const unresolved = uniqueKnowledgeRefs(members.flatMap(movement => movement.unresolved || []));
    const pageTitle = affected.find(ref => ref.type === 'wiki_page')?.title || 'your Wiki';
    const multiClaim = subjects.length > 1;
    const reviewRequired = members.some(movement => movement.reviewState === 'candidate');
    return {
      ...representative,
      id: episodeId,
      episodeId,
      title: multiClaim
        ? `One evidence update affected ${subjects.length} claims in ${pageTitle}`
        : representative.title,
      whyItMatters: multiClaim
        ? reviewRequired
          ? 'The claims remain unchanged until you review this proposed update.'
          : 'The evidence changed together; inspect the affected claims before revising your judgment.'
        : representative.whyItMatters,
      subjects,
      evidence,
      affected,
      unresolved,
      nextAction: multiClaim
        ? pageScopedInvestigationAction(representative.nextAction)
        : representative.nextAction,
      provenance: {
        eventIds: stringIds(members.flatMap(movement => movement.provenance?.eventIds || [])),
        revisionIds: stringIds(members.flatMap(movement => movement.provenance?.revisionIds || [])),
        deterministicFacts: Array.from(new Set(
          members.flatMap(movement => movement.provenance?.deterministicFacts || [])
        ))
      }
    };
  }).sort((left, right) => (
    compareEpisodeStrength(left, right)
    || new Date(right.occurredAt || 0) - new Date(left.occurredAt || 0)
    || left.id.localeCompare(right.id)
  ));
};

const mergeDuplicateMovements = movements => {
  const grouped = new Map();
  movements.forEach(movement => {
    const existing = grouped.get(movement.id);
    if (!existing) {
      grouped.set(movement.id, movement);
      return;
    }
    existing.provenance.eventIds = stringIds([
      ...existing.provenance.eventIds,
      ...movement.provenance.eventIds
    ]);
    existing.provenance.revisionIds = stringIds([
      ...existing.provenance.revisionIds,
      ...movement.provenance.revisionIds
    ]);
    existing.provenance.deterministicFacts = Array.from(new Set([
      ...existing.provenance.deterministicFacts,
      ...movement.provenance.deterministicFacts
    ]));
    if (new Date(movement.occurredAt || 0) > new Date(existing.occurredAt || 0)) {
      existing.occurredAt = movement.occurredAt;
    }
  });
  return Array.from(grouped.values());
};

const buildDecisionDueMovements = async ({ userId, models, since, limit, asOf = new Date() }) => {
  if (!models.WikiPage?.find) return [];
  const index = await buildDecisionIndex({
    userId,
    filter: 'upcoming_review',
    windowDays: 365,
    limit: Math.min(Math.max(limit * QUERY_MULTIPLIER, limit), 100),
    asOf,
    models
  });
  return (index.items || []).filter(item => (
    item?.dueState === 'overdue'
    && item?.continuity?.complete === true
    && item?.decision?.reviewAt
    && (!item?.decision?.outcomeDueAt || new Date(item.decision.outcomeDueAt) > asOf)
    && (!since || new Date(item.decision.reviewAt) > new Date(since))
  )).map(item => {
    const pageId = id(item?.identity?.pageId);
    const decisionId = clean(item?.identity?.decisionId, 160);
    const reviewAt = new Date(item.decision.reviewAt).toISOString();
    const evidence = Array.isArray(item?.links?.sources?.resolved) ? item.links.sources.resolved : [];
    const claims = Array.isArray(item?.links?.claims?.resolved) ? item.links.claims.resolved : [];
    return {
      id: decisionDueMovementId({ pageId, decisionId, reviewAt }),
      episodeId: `decision_episode:v1:${pageId}:${decisionId}:${reviewAt}`,
      kind: 'decision_due',
      occurredAt: reviewAt,
      title: `Review due: ${clean(item?.subject?.title || 'Wiki decision', 180)}`,
      whyItMatters: 'The review date explicitly set by the human owner has arrived. Noeis has not inferred an outcome.',
      materiality: 'major',
      reviewState: 'current',
      subject: item.subject,
      evidence,
      affected: [item.page, ...claims],
      unresolved: [item.subject],
      nextAction: {
        label: 'Review decision',
        href: item.subject.href,
        intent: 'review_decision',
        wikiPageId: pageId,
        decisionId
      },
      provenance: {
        eventIds: [],
        revisionIds: stringIds([
          item?.continuity?.acceptedRevisionId,
          item?.continuity?.recordedRevisionId
        ]),
        deterministicFacts: [
          `Human-set review date: ${reviewAt}`,
          `Decision status: ${clean(item?.decision?.status, 40)}`,
          `Accepted revision: ${clean(item?.continuity?.acceptedRevisionId, 160)}`
        ]
      }
    };
  });
};

const buildOutcomeDueMovements = async ({ userId, models, since, limit, asOf = new Date() }) => {
  if (!models.WikiPage?.find) return [];
  const index = await buildDecisionIndex({
    userId,
    filter: 'awaiting_outcome',
    windowDays: 365,
    limit: Math.min(Math.max(limit * QUERY_MULTIPLIER, limit), 100),
    asOf,
    models
  });
  return (index.items || []).filter(item => {
    const outcomeDueAt = item?.decision?.outcomeDueAt;
    return item?.decision?.status === 'taken'
      && item?.outcome?.state === 'awaiting_observation'
      && item?.continuity?.complete === true
      && outcomeDueAt
      && new Date(outcomeDueAt) <= asOf
      && (!since || new Date(outcomeDueAt) > new Date(since));
  }).map(item => {
    const pageId = id(item?.identity?.pageId);
    const decisionId = clean(item?.identity?.decisionId, 160);
    const outcomeDueAt = new Date(item.decision.outcomeDueAt).toISOString();
    const evidence = Array.isArray(item?.links?.sources?.resolved) ? item.links.sources.resolved : [];
    const claims = Array.isArray(item?.links?.claims?.resolved) ? item.links.claims.resolved : [];
    return {
      id: outcomeDueMovementId({ pageId, decisionId, outcomeDueAt }),
      episodeId: `outcome_episode:v1:${pageId}:${decisionId}:${outcomeDueAt}`,
      kind: 'outcome_due',
      occurredAt: outcomeDueAt,
      title: `Outcome due: ${clean(item?.subject?.title || 'Wiki decision', 180)}`,
      whyItMatters: 'The outcome date explicitly set by the human owner has arrived. Noeis has not inferred a result.',
      materiality: 'major',
      reviewState: 'current',
      subject: item.subject,
      evidence,
      affected: [item.page, ...claims],
      unresolved: [item.subject],
      nextAction: {
        label: 'Record outcome',
        href: item.subject.href,
        intent: 'review_decision',
        wikiPageId: pageId,
        decisionId
      },
      provenance: {
        eventIds: [],
        revisionIds: stringIds([
          item?.continuity?.acceptedRevisionId,
          item?.continuity?.recordedRevisionId
        ]),
        deterministicFacts: [
          `Human-set outcome date: ${outcomeDueAt}`,
          `Decision status: ${clean(item?.decision?.status, 40)}`,
          `Accepted revision: ${clean(item?.continuity?.acceptedRevisionId, 160)}`
        ]
      }
    };
  });
};

const buildOutcomeReviewedMovements = async ({ userId, models, since, limit, asOf = new Date() }) => {
  if (!models.WikiPage?.find || !models.NoeisReceipt?.find || !models.WikiRevision?.find) return [];
  const index = await buildDecisionIndex({
    userId,
    filter: 'reviewed',
    windowDays: 365,
    limit: Math.min(Math.max(limit * QUERY_MULTIPLIER, limit), 100),
    asOf,
    models
  });
  return (index.items || []).filter(item => {
    const reviewedAt = item?.outcome?.reviewedAt;
    return item?.decision?.status === 'reviewed'
      && item?.outcome?.state === 'observed'
      && item?.continuity?.complete === true
      && reviewedAt
      && new Date(reviewedAt) <= asOf
      && item?.outcome?.receiptId
      && clean(item?.outcome?.lesson)
      && clean(item?.outcome?.result) !== 'unknown'
      && Array.isArray(item?.outcome?.evidence)
      && item.outcome.evidence.length > 0
      && (!since || new Date(reviewedAt) > new Date(since));
  }).map(item => {
    const pageId = id(item?.identity?.pageId);
    const decisionId = clean(item?.identity?.decisionId, 160);
    const reviewedAt = new Date(item.outcome.reviewedAt).toISOString();
    const observedAt = new Date(item.outcome.observedAt).toISOString();
    const receiptId = clean(item.outcome.receiptId, 300);
    const claims = Array.isArray(item?.links?.claims?.resolved) ? item.links.claims.resolved : [];
    return {
      id: outcomeReviewedMovementId(receiptId),
      episodeId: `outcome_reviewed_episode:v1:${receiptId}`,
      kind: 'outcome_reviewed',
      occurredAt: reviewedAt,
      title: `Outcome reviewed: ${clean(item?.subject?.title || 'Wiki decision', 180)}`,
      whyItMatters: 'The human owner recorded the observed result, calibration, and retained lesson. Noeis did not infer the outcome.',
      materiality: 'supporting',
      reviewState: 'current',
      reviewedOutcome: {
        result: clean(item.outcome.result, 40),
        summary: clean(item.outcome.summary, 800),
        processScore: Number.isFinite(Number(item.outcome.processScore))
          ? Number(item.outcome.processScore)
          : null,
        calibrationNote: clean(item.outcome.calibrationNote, 1200),
        lesson: clean(item.outcome.lesson, 1200),
        observedAt,
        reviewedAt
      },
      subject: item.subject,
      evidence: item.outcome.evidence,
      affected: [item.page, ...claims],
      unresolved: [],
      nextAction: {
        label: 'Open reviewed outcome',
        href: item.subject.href,
        intent: 'open_reviewed_outcome',
        wikiPageId: pageId,
        decisionId
      },
      provenance: {
        eventIds: [],
        revisionIds: stringIds([
          item?.continuity?.acceptedRevisionId,
          item?.continuity?.recordedRevisionId,
          item?.continuity?.outcomeRevisionId
        ]),
        deterministicFacts: [
          `Human-recorded result: ${clean(item.outcome.result, 40)}`,
          `Observed at: ${observedAt}`,
          `Reviewed at: ${reviewedAt}`,
          `Outcome receipt: ${receiptId}`
        ]
      }
    };
  });
};

const buildKnowledgeMovements = async ({
  userId,
  models = {},
  since = null,
  limit = DEFAULT_LIMIT,
  asOf = new Date(),
  includeRoutineMovements = true,
  reviewRequiredOnly = false
} = {}) => {
  if (!userId) throw new Error('buildKnowledgeMovements requires a userId.');
  if (!models.WikiPage?.find) {
    return [];
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT));
  let decisionDueMovements = [];
  let outcomeDueMovements = [];
  let outcomeReviewedMovements = [];
  let questionAnswerableMovements = [];
  let connectionFormedMovements = [];
  if (includeRoutineMovements) {
    decisionDueMovements = await buildDecisionDueMovements({
      userId, models, since, limit: safeLimit, asOf
    });
    outcomeDueMovements = await buildOutcomeDueMovements({
      userId, models, since, limit: safeLimit, asOf
    });
    outcomeReviewedMovements = await buildOutcomeReviewedMovements({
      userId, models, since, limit: safeLimit, asOf
    });
    questionAnswerableMovements = await buildQuestionAnswerableMovements({
      userId, models, since, limit: safeLimit
    });
    connectionFormedMovements = await buildConnectionFormedMovements({
      userId, models, since, limit: safeLimit
    });
  }
  const finalize = sourceMovements => mergeDuplicateMovements([
    ...outcomeReviewedMovements,
    ...outcomeDueMovements,
    ...decisionDueMovements,
    ...questionAnswerableMovements,
    ...connectionFormedMovements,
    ...(Array.isArray(sourceMovements) ? sourceMovements : [])
  ])
    .sort((left, right) => (
      new Date(right.occurredAt || 0) - new Date(left.occurredAt || 0)
      || (MATERIALITY_RANK[left.materiality] ?? 99) - (MATERIALITY_RANK[right.materiality] ?? 99)
      || left.id.localeCompare(right.id)
    ))
    .slice(0, safeLimit);
  if (!models.WikiSourceEvent?.find || !models.WikiRevision?.find) return finalize([]);
  const acceptanceKinds = [
    'company_dossier_first_head_accepted',
    'company_dossier_maintenance_accepted',
    'wiki_claim_disposition'
  ];
  const acceptedAtByRevisionId = new Map();
  if (!reviewRequiredOnly && models.NoeisReceipt?.find) {
    const acceptanceQuery = {
      userId,
      status: 'completed',
      kind: { $in: acceptanceKinds },
      $or: [
        { 'provenance.candidateRevisionId': { $ne: null } },
        { 'provenance.revisionId': { $ne: null } }
      ]
    };
    if (since) acceptanceQuery.completedAt = { $gt: new Date(since) };
    let acceptanceReceiptsQuery = models.NoeisReceipt.find(acceptanceQuery);
    acceptanceReceiptsQuery = acceptanceReceiptsQuery.sort?.({ completedAt: -1 }) || acceptanceReceiptsQuery;
    acceptanceReceiptsQuery = acceptanceReceiptsQuery.limit?.(safeLimit * QUERY_MULTIPLIER) || acceptanceReceiptsQuery;
    acceptanceReceiptsQuery = acceptanceReceiptsQuery.lean?.() || acceptanceReceiptsQuery;
    (await acceptanceReceiptsQuery || [])
      .map(plain)
      .filter(receipt => (
        id(receipt.userId) === id(userId)
        && acceptanceKinds.includes(receipt.kind)
        && receipt.status === 'completed'
        && validDate(receipt.completedAt)
        && (!since || validDate(receipt.completedAt) > new Date(since))
      ))
      .forEach(receipt => {
        const revisionId = acceptanceReceiptRevisionId(receipt);
        const completedAt = receipt.completedAt;
        if (!revisionId || !completedAt) return;
        const previous = acceptedAtByRevisionId.get(revisionId);
        if (!previous || new Date(completedAt) > new Date(previous)) {
          acceptedAtByRevisionId.set(revisionId, completedAt);
        }
      });
  }
  const acceptedInWindowIds = Array.from(acceptedAtByRevisionId.keys());
  const revisionQuery = {
    userId,
    sourceEventId: { $ne: null },
    promotionStatus: { $in: ['candidate', 'promoted'] },
    before: { $ne: null },
    after: { $ne: null }
  };
  if (since) revisionQuery.createdAt = { $gt: new Date(since) };
  const movementRevisionFields = '_id userId pageId sourceEventId promotionStatus reason actorType claimReview before.claims after.claims after.sourceRefs after.citations createdAt snapshotPrunedAt';
  let recentRevisions = [];
  if (reviewRequiredOnly) {
    let reviewPagesQuery = models.WikiPage.find({
      userId,
      status: { $ne: 'archived' },
      $or: [
        { 'freshness.status': 'needs_review' },
        { 'aiState.candidateStatus': { $in: ['awaiting_claim_acceptance', 'unbounded_candidate'] } }
      ]
    });
    reviewPagesQuery = reviewPagesQuery.select?.('_id') || reviewPagesQuery;
    reviewPagesQuery = reviewPagesQuery.limit?.(safeLimit * QUERY_MULTIPLIER) || reviewPagesQuery;
    reviewPagesQuery = reviewPagesQuery.lean?.() || reviewPagesQuery;
    const reviewPageIds = (await reviewPagesQuery || []).map(id).filter(Boolean);
    if (reviewPageIds.length) {
      let revisionsQuery = models.WikiRevision.find({
        ...revisionQuery,
        pageId: { $in: reviewPageIds },
        promotionStatus: 'candidate'
      });
      revisionsQuery = revisionsQuery.select?.(movementRevisionFields) || revisionsQuery;
      revisionsQuery = revisionsQuery.sort?.({ pageId: 1, createdAt: -1 }) || revisionsQuery;
      revisionsQuery = revisionsQuery.limit?.(safeLimit * QUERY_MULTIPLIER) || revisionsQuery;
      revisionsQuery = revisionsQuery.lean?.() || revisionsQuery;
      recentRevisions = (await revisionsQuery || []).map(plain);
    }
  } else {
    let revisionsQuery = models.WikiRevision.find(revisionQuery);
    revisionsQuery = revisionsQuery.select?.(movementRevisionFields) || revisionsQuery;
    revisionsQuery = revisionsQuery.sort?.({ createdAt: -1 }) || revisionsQuery;
    revisionsQuery = revisionsQuery.limit?.(safeLimit * QUERY_MULTIPLIER) || revisionsQuery;
    revisionsQuery = revisionsQuery.lean?.() || revisionsQuery;
    recentRevisions = (await revisionsQuery || []).map(plain);
  }
  let acceptedRevisions = [];
  if (acceptedInWindowIds.length) {
    let acceptedRevisionsQuery = models.WikiRevision.find({
      userId,
      _id: { $in: acceptedInWindowIds },
      sourceEventId: { $ne: null },
      promotionStatus: { $in: ['candidate', 'promoted'] },
      before: { $ne: null },
      after: { $ne: null }
    });
    acceptedRevisionsQuery = acceptedRevisionsQuery.select?.(movementRevisionFields) || acceptedRevisionsQuery;
    acceptedRevisionsQuery = acceptedRevisionsQuery.lean?.() || acceptedRevisionsQuery;
    acceptedRevisions = (await acceptedRevisionsQuery || []).map(plain);
  }
  const revisions = Array.from(new Map(
    [...recentRevisions, ...acceptedRevisions].map(revision => [id(revision), revision])
  ).values())
    .filter(revision => (
      id(revision.userId) === id(userId)
      && ['candidate', 'promoted'].includes(revision.promotionStatus)
      && revision.before
      && revision.after
      && !revision.snapshotPrunedAt
      && (
        !since
        || new Date(revision.createdAt) > new Date(since)
        || acceptedAtByRevisionId.has(id(revision))
      )
    ));
  if (!revisions.length) return finalize([]);

  const eventIds = stringIds(revisions.map(revision => revision.sourceEventId));
  let eventsQuery = models.WikiSourceEvent.find({
    userId,
    _id: { $in: eventIds },
    status: 'processed',
    affectedPageIds: { $exists: true, $ne: [] }
  });
  eventsQuery = eventsQuery.sort?.({ createdAt: -1, _id: 1 }) || eventsQuery;
  eventsQuery = eventsQuery.lean?.() || eventsQuery;
  const events = (await eventsQuery || [])
    .map(plain)
    .filter(event => (
      id(event.userId) === id(userId)
      && event.status === 'processed'
      && Array.isArray(event.affectedPageIds)
      && event.affectedPageIds.length > 0
    ));
  if (!events.length) return finalize([]);

  const eventById = new Map(events.map(event => [id(event), event]));
  const resolvedEventIds = await resolveClaimEvidenceEvents({ userId, models, events });
  const acceptedRevisionIds = new Set();
  let acceptanceReceipts = [];
  if (models.NoeisReceipt?.find) {
    const revisionIds = stringIds(revisions.map(revision => revision._id));
    let receiptsQuery = models.NoeisReceipt.find({
      userId,
      status: 'completed',
      kind: { $in: acceptanceKinds },
      $or: [
        { 'provenance.candidateRevisionId': { $in: revisionIds } },
        { 'provenance.revisionId': { $in: revisionIds } }
      ]
    });
    receiptsQuery = receiptsQuery.lean?.() || receiptsQuery;
    acceptanceReceipts = (await receiptsQuery || [])
      .map(plain)
      .filter(receipt => (
        id(receipt.userId) === id(userId)
        && acceptanceKinds.includes(receipt.kind)
        && receipt.status === 'completed'
        && validDate(receipt.completedAt)
      ));
  }
  const pageIds = stringIds(revisions.map(revision => revision.pageId));
  let pagesQuery = models.WikiPage.find({
    userId,
    _id: { $in: pageIds },
    status: { $ne: 'archived' },
    archived: { $ne: true },
    hiddenFromHome: { $ne: true },
    debugOnly: { $ne: true }
  });
  if (pagesQuery.select) {
    pagesQuery = pagesQuery.select('_id userId title slug pageType status createdFrom hiddenFromHome debugOnly archived aiState.draftStatus aiState.lastError aiState.errorCode aiState.quality plainText sourceRefs._id');
  }
  pagesQuery = pagesQuery.lean?.() || pagesQuery;
  const pages = (await pagesQuery || [])
    .map(plain)
    .filter(page => (
      id(page.userId) === id(userId)
      && page.status !== 'archived'
      && page.archived !== true
      && page.hiddenFromHome !== true
      && page.debugOnly !== true
      && isWikiPageSurfaceEligible(page)
    ));
  const pageById = new Map(pages.map(page => [id(page), page]));
  const revisionById = new Map(revisions.map(revision => [id(revision), revision]));
  acceptanceReceipts.forEach(receipt => {
    const revisionId = acceptanceReceiptRevisionId(receipt);
    const revision = revisionById.get(revisionId);
    if (!revision) return;
    if (receipt.kind === 'wiki_claim_disposition') {
      try {
        assertClaimDispositionReplayReceipt({
          storedReceipt: receipt,
          revision,
          action: 'accept',
          page: pageById.get(id(revision.pageId)) || null
        });
      } catch (_error) {
        return;
      }
    }
    acceptedRevisionIds.add(revisionId);
    const previous = acceptedAtByRevisionId.get(revisionId);
    if (!previous || validDate(receipt.completedAt) > validDate(previous)) {
      acceptedAtByRevisionId.set(revisionId, receipt.completedAt);
    }
  });

  const legacyConceptIds = stringIds(pages
    .filter(page => page.createdFrom?.type === 'concept')
    .map(page => page.createdFrom?.objectId));
  let concepts = [];
  if (pages.length && models.TagMeta?.find) {
    let conceptsQuery = models.TagMeta.find({
      userId,
      $or: [
        { _id: { $in: legacyConceptIds } },
        {
          'continuityAnchor.kind': 'wiki_investigation',
          'continuityAnchor.objectType': 'wiki_page',
          'continuityAnchor.objectId': { $in: pageIds }
        }
      ],
      archived: { $ne: true },
      hiddenFromHome: { $ne: true },
      debugOnly: { $ne: true }
    });
    if (conceptsQuery.select) {
      conceptsQuery = conceptsQuery.select(
        '_id userId name continuityAnchor archived hiddenFromHome debugOnly'
      );
    }
    conceptsQuery = conceptsQuery.lean?.() || conceptsQuery;
    concepts = (await conceptsQuery || [])
      .map(plain)
      .filter(concept => (
        id(concept.userId) === id(userId)
        && concept.archived !== true
        && concept.hiddenFromHome !== true
        && concept.debugOnly !== true
      ));
  }
  const conceptById = new Map(concepts.map(concept => [id(concept), concept]));
  const conceptByPageId = new Map(concepts
    .filter(concept => (
      concept.continuityAnchor?.kind === 'wiki_investigation'
      && concept.continuityAnchor?.objectType === 'wiki_page'
      && concept.continuityAnchor?.objectId
    ))
    .map(concept => [id(concept.continuityAnchor.objectId), concept]));

  const movements = [];
  for (const revision of revisions) {
    const event = eventById.get(id(revision.sourceEventId));
    const page = pageById.get(id(revision.pageId));
    if (!event || !page || !revision.before || !revision.after || revision.snapshotPrunedAt) continue;
    if (!event.affectedPageIds.map(id).includes(id(revision.pageId))) continue;
    if (!resolvedEventIds.has(id(event))) continue;
    for (const impact of diffClaimState(revision)) {
      const movement = buildMovement({
        event,
        revision,
        page,
        impact,
        conceptById,
        conceptByPageId,
        acceptedRevisionIds,
        acceptedAtByRevisionId
      });
      if (
        movement
        && (!since || new Date(movement.occurredAt) > new Date(since))
      ) {
        movement.evidence = await resolveDurableMovementEvidence({
          movement, userId, models, event
        });
        movements.push(movement);
      }
    }
  }

  return finalize(movements);
};

// The weekly digest is a retrospective: it counts what happened, never what
// is merely overdue. Standing states (decision_due, outcome_due,
// question_answerable) are excluded by design — they belong to the day, and
// they would repeat every week.
const WEEKLY_EVENT_KINDS = Object.freeze([
  'claim_changed',
  'new_evidence',
  'contradiction',
  'connection_formed',
  'outcome_reviewed'
]);

const pageRefForMovement = movement => {
  const affectedPage = (Array.isArray(movement?.affected) ? movement.affected : [])
    .find(ref => ref && ref.type === 'wiki_page' && ref.id);
  if (affectedPage) return affectedPage;
  if (movement?.subject?.type === 'wiki_page') return movement.subject;
  return null;
};

const buildWeeklyDigest = async ({ userId, models = {}, asOf = new Date(), limit = 120 } = {}) => {
  const weekEnd = new Date(asOf);
  const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const movements = await buildKnowledgeMovements({
    userId,
    models,
    since: weekStart.toISOString(),
    limit: Math.max(1, Math.min(Number(limit) || 120, 200)),
    asOf: weekEnd
  });
  const eventMovements = (Array.isArray(movements) ? movements : [])
    .filter(movement => WEEKLY_EVENT_KINDS.includes(movement.kind));
  const groupsByPage = new Map();
  eventMovements.forEach(movement => {
    const pageRef = pageRefForMovement(movement);
    const key = pageRef ? `page:${pageRef.id}` : `${movement.subject?.type || 'unknown'}:${movement.subject?.id || movement.id}`;
    if (!groupsByPage.has(key)) {
      groupsByPage.set(key, {
        subject: pageRef
          ? { type: 'wiki_page', id: pageRef.id, title: pageRef.title, href: pageRef.href }
          : { type: movement.subject?.type || 'unknown', id: movement.subject?.id || '', title: movement.subject?.title || '', href: movement.subject?.href || '/wiki' },
        items: [],
        worstMateriality: movement.materiality,
        lastOccurredAt: movement.occurredAt
      });
    }
    const group = groupsByPage.get(key);
    group.items.push({
      kind: movement.kind,
      label: movement.kind.replace(/_/g, ' '),
      title: movement.title,
      whyItMatters: movement.whyItMatters || '',
      occurredAt: movement.occurredAt,
      href: movement.nextAction?.href || movement.subject?.href || group.subject.href
    });
    if ((MATERIALITY_RANK[movement.materiality] ?? 99) < (MATERIALITY_RANK[group.worstMateriality] ?? 99)) {
      group.worstMateriality = movement.materiality;
    }
    if (new Date(movement.occurredAt || 0).getTime() > new Date(group.lastOccurredAt || 0).getTime()) {
      group.lastOccurredAt = movement.occurredAt;
    }
  });
  const groups = Array.from(groupsByPage.values())
    .map(group => ({
      subject: group.subject,
      items: group.items.sort((left, right) => new Date(right.occurredAt || 0) - new Date(left.occurredAt || 0)),
      worstMateriality: group.worstMateriality,
      lastOccurredAt: group.lastOccurredAt
    }))
    .sort((left, right) => (
      (MATERIALITY_RANK[left.worstMateriality] ?? 99) - (MATERIALITY_RANK[right.worstMateriality] ?? 99)
      || new Date(right.lastOccurredAt || 0).getTime() - new Date(left.lastOccurredAt || 0).getTime()
    ));
  const totals = eventMovements.reduce((acc, movement) => {
    acc[movement.kind] = (acc[movement.kind] || 0) + 1;
    return acc;
  }, {});
  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    totals,
    total: eventMovements.length,
    groups,
    quiet: eventMovements.length === 0
  };
};

// Deck state: which movement cards the reader resolved today, and whether
// the day's paper is closed. It rides the existing morningPaper subdoc, so
// it survives reload without a new collection. A deck whose date stops
// matching UTC today resets by construction.
const DECK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DECK_MAX_RESOLVED = 100;

const asPlainRecord = value => (value && typeof value.toObject === 'function'
  ? value.toObject({ virtuals: false })
  : value);

const todayKey = (now = new Date()) => new Date(now).toISOString().slice(0, 10);

const deckFor = (user, now = new Date()) => {
  const deck = asPlainRecord(user?.morningPaper?.deck) || {};
  const date = todayKey(now);
  if (deck.date !== date) return { date, resolvedIds: [], closedAt: null };
  return {
    date: deck.date,
    resolvedIds: (Array.isArray(deck.resolvedIds) ? deck.resolvedIds : []).slice(0, DECK_MAX_RESOLVED),
    closedAt: deck.closedAt || null
  };
};

const applyDeckState = ({ user, body = {}, now = new Date() } = {}) => {
  if (!user) {
    const error = new Error('User not found.');
    error.statusCode = 404;
    throw error;
  }
  const current = deckFor(user, now);
  const requestedDate = body.date === undefined || body.date === null || body.date === ''
    ? current.date
    : String(body.date);
  if (!DECK_DATE_PATTERN.test(requestedDate)) {
    const error = new Error('date must be YYYY-MM-DD.');
    error.statusCode = 400;
    throw error;
  }
  const deck = requestedDate === current.date
    ? { date: current.date, resolvedIds: [...current.resolvedIds], closedAt: current.closedAt }
    : { date: requestedDate, resolvedIds: [], closedAt: null };

  if (body.resolveId !== undefined && body.resolveId !== null) {
    const resolveId = String(body.resolveId).trim();
    if (!resolveId || resolveId.length > 200) {
      const error = new Error('resolveId must be a non-empty id of 200 characters or fewer.');
      error.statusCode = 400;
      throw error;
    }
    if (!deck.resolvedIds.includes(resolveId)) {
      if (deck.resolvedIds.length >= DECK_MAX_RESOLVED) {
        const error = new Error(`The deck already holds the maximum of ${DECK_MAX_RESOLVED} resolved movements for today.`);
        error.statusCode = 409;
        throw error;
      }
      deck.resolvedIds.push(resolveId);
    }
  }
  if (body.closed !== undefined) {
    deck.closedAt = body.closed ? new Date(now) : null;
  }
  user.morningPaper = { ...(asPlainRecord(user.morningPaper) || {}), deck };
  return deck;
};

module.exports = {
  MOVEMENT_KINDS,
  WEEKLY_EVENT_KINDS,
  buildKnowledgeMovements,
  buildWeeklyDigest,
  buildKnowledgeMovementEpisodes,
  todayKey,
  deckFor,
  applyDeckState,
  diffClaimState,
  mergeDuplicateMovements,
  sourceFingerprint,
  movementId,
  movementEpisodeId,
  decisionDueMovementId,
  outcomeDueMovementId,
  outcomeReviewedMovementId,
  questionAnswerableMovementId,
  connectionFormedMovementId,
  safeUrl,
  conceptInvestigationHref,
  __testables: {
    buildMovement,
    buildDecisionDueMovements,
    buildOutcomeDueMovements,
    buildOutcomeReviewedMovements,
    buildQuestionAnswerableMovements,
    buildConnectionFormedMovements,
    kindForImpact,
    materialityFor,
    deterministicFactsFor
  }
};
