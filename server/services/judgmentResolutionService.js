const crypto = require('crypto');
const { createWikiRevision, snapshotPage } = require('./wikiRevisionService');
const { persistNoeisReceipt, serializeStoredReceipt } = require('./noeisReceiptService');
const { clockFact } = require('./judgmentLedger');

const RESULTS = new Set(['held_up', 'broke', 'partly', 'unresolvable', 'right_for_wrong_reasons']);
const EVIDENCE_FIELDS = new Set(['why', 'against']);
const ACTIONS = {
  criteria: {
    collection: 'resolutionHistory',
    kind: 'judgment_resolution_set',
    summary: 'Resolution test set by the owner.',
    title: 'A belief got a test'
  },
  verdict: {
    collection: 'verdicts',
    kind: 'judgment_verdict_recorded',
    summary: 'Claim verdict recorded by the owner.',
    title: 'A belief met the world'
  },
  evidence: {
    collection: 'evidenceResponses',
    kind: 'judgment_evidence_filed',
    summary: 'A saved passage was filed on a held sentence.',
    title: 'Reading talked back'
  }
};

class JudgmentResolutionError extends Error {
  constructor(message, status = 400, code = 'invalid_request') {
    super(message);
    this.name = 'JudgmentResolutionError';
    this.status = status;
    this.code = code;
  }
}

const clean = (value = '', limit = 4000) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const list = value => Array.isArray(value) ? value : [];
const id = value => String(value?._id || value?.id || value || '').trim();
const plain = value => value?.toObject ? value.toObject({ virtuals: false }) : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique = values => Array.from(new Set(list(values).map(id).filter(Boolean)));
const queryInSession = (query, session) => query?.session ? query.session(session) : query;
const resolveQuery = query => query?.then ? query : Promise.resolve(query);
const asDate = (value, field, { future = false, now = new Date() } = {}) => {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new JudgmentResolutionError(`${field} must be a valid date.`);
  if (future && date <= now) throw new JudgmentResolutionError(`${field} must be in the future.`);
  return date;
};
const safeObjectId = (Model) => {
  const ObjectId = Model?.db?.base?.Types?.ObjectId;
  if (!ObjectId) throw new JudgmentResolutionError('Wiki revision identity is unavailable.', 503, 'unavailable');
  return new ObjectId();
};
const requireModels = ({ WikiPage, WikiRevision, NoeisReceipt }) => {
  if (!WikiPage || !WikiRevision || !NoeisReceipt) {
    throw new JudgmentResolutionError('Judgment resolution persistence is unavailable.', 503, 'unavailable');
  }
  if (typeof WikiPage?.db?.startSession !== 'function') {
    throw new JudgmentResolutionError('Judgment resolution writes require MongoDB transaction support.', 503, 'transactions_required');
  }
};
const claimHash = claim => digest({ claim: clean(claim, 8000) });
const payloadHash = payload => digest(payload);
const receiptId = ({ pageId, requestId, action }) => `judgment-resolution:v1:${pageId}:${action}:${requestId}`;
const objectId = value => /^[a-f\d]{24}$/i.test(id(value));
const actionContract = action => {
  const contract = ACTIONS[action];
  if (!contract) throw new JudgmentResolutionError('Unknown judgment mutation.', 500, 'unknown_action');
  return contract;
};

const loadReceipt = async ({ NoeisReceipt, userId, receiptId: key, session }) => (
  resolveQuery(queryInSession(NoeisReceipt.findOne({ userId, receiptId: key }), session))
);

const assertReplay = ({ stored, page, revision, requestId, action, expectedClaimHash, expectedPayloadHash }) => {
  const raw = plain(stored);
  const provenance = plain(raw?.provenance) || {};
  const key = receiptId({ pageId: id(page), requestId, action });
  const contract = actionContract(action);
  const artifact = list(page?.judgment?.[contract.collection])
    .find(entry => clean(entry?.receiptId, 300) === key);
  const revisionJudgment = plain(revision?.after?.judgment) || {};
  const revisionArtifacts = list(revisionJudgment[contract.collection]);
  const revisionArtifact = revisionArtifacts.find(entry => clean(entry?.receiptId, 300) === key);
  if (!raw
    || clean(raw.receiptId || raw.id, 300) !== key
    || clean(raw.kind, 100) !== contract.kind
    || clean(raw.source, 40) !== 'wiki'
    || clean(raw.status, 40) !== 'completed'
    || clean(provenance.action, 40) !== action
    || id(provenance.pageId) !== id(page)
    || clean(provenance.requestId, 160) !== requestId
    || clean(provenance.claimHash, 128) !== expectedClaimHash
    || clean(provenance.payloadHash, 128) !== expectedPayloadHash
    || id(provenance.revisionId) !== id(artifact?.revisionId)
    || !artifact
    || clean(artifact.claimHash, 128) !== expectedClaimHash
    || !artifact.revisionId
    || !revision
    || id(revision._id) !== id(artifact.revisionId)
    || id(revision.pageId) !== id(page)
    || !revisionArtifact
    || clean(revisionArtifact.claimHash, 128) !== expectedClaimHash) {
    throw new JudgmentResolutionError('Judgment resolution replay failed its integrity contract.', 409, 'receipt_integrity_failed');
  }
  return artifact;
};

const exactClaim = ({ page, expectedClaim }) => {
  const held = clean(page?.judgment?.currentJudgment, 8000);
  if (!held) throw new JudgmentResolutionError('This page does not hold a judgment.', 409, 'claim_missing');
  if (clean(expectedClaim, 8000) !== held) {
    throw new JudgmentResolutionError('The held sentence changed. Reopen the case before resolving it.', 409, 'stale_claim');
  }
  return { held, hash: claimHash(held) };
};

const exactEvidence = (page, requested = []) => {
  const ids = unique(requested);
  const counts = new Map();
  list(page?.sourceRefs).forEach(ref => {
    const key = id(ref);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });
  if (ids.some(key => counts.get(key) !== 1)) {
    throw new JudgmentResolutionError('Every verdict source must resolve exactly once on this case.', 409, 'unresolved_evidence');
  }
  return ids;
};

const persistMutation = async ({
  action, userId, pageId, requestId, expectedClaim, payload, mutate,
  WikiPage, WikiRevision, NoeisReceipt, now = () => new Date()
}) => {
  requireModels({ WikiPage, WikiRevision, NoeisReceipt });
  const safePageId = id(pageId);
  const safeRequestId = clean(requestId, 160);
  if (!safePageId || !safeRequestId || !clean(expectedClaim, 8000)) {
    throw new JudgmentResolutionError('pageId, requestId, and expectedClaim are required.');
  }
  const actedAt = now();
  const expectedClaimHash = claimHash(expectedClaim);
  const expectedPayloadHash = payloadHash(payload);
  const key = receiptId({ pageId: safePageId, requestId: safeRequestId, action });
  const session = await WikiPage.db.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const page = await resolveQuery(queryInSession(WikiPage.findOne({
        _id: safePageId, userId, status: { $ne: 'archived' }
      }), session));
      if (!page) throw new JudgmentResolutionError('Judgment not found.', 404, 'not_found');
      const { held, hash } = exactClaim({ page, expectedClaim });
      if (hash !== expectedClaimHash) throw new JudgmentResolutionError('The held sentence changed.', 409, 'stale_claim');
      const stored = await loadReceipt({ NoeisReceipt, userId, receiptId: key, session });
      if (stored) {
        const storedProvenance = plain(stored?.provenance) || {};
        const revision = await resolveQuery(queryInSession(WikiRevision.findOne({
          _id: storedProvenance.revisionId,
          userId,
          pageId: safePageId
        }), session));
        const artifact = assertReplay({
          stored, page, revision, requestId: safeRequestId, action,
          expectedClaimHash, expectedPayloadHash
        });
        result = { idempotent: true, page, artifact, receipt: serializeStoredReceipt(stored) };
        return;
      }
      const before = snapshotPage(page);
      const revisionId = safeObjectId(WikiRevision);
      if (!page.judgment.bornAt) page.judgment.bornAt = page.createdAt || actedAt;
      const artifact = await mutate({ page, held, hash, actedAt, revisionId, receiptId: key, session });
      page.markModified?.('judgment');
      await page.save({ session });
      const contract = actionContract(action);
      const revision = await createWikiRevision({
        WikiRevision, revisionId, userId, page, before, reason: 'user_edit', actorType: 'user',
        summary: contract.summary,
        session
      });
      const receipt = await persistNoeisReceipt({
        NoeisReceipt, userId, session,
        receipt: {
          id: key,
          kind: contract.kind,
          source: 'wiki', sourceLabel: 'Judgment', status: 'completed', completedAt: actedAt,
          title: contract.title,
          summary: action === 'criteria' ? payload.criteria : action === 'verdict' ? payload.note : artifact.text,
          touched: [
            { type: 'wiki_page', id: safePageId, title: page.title },
            { type: 'wiki_revision', id: id(revision), title: action }
          ],
          provenance: {
            version: 1, action, pageId: safePageId, requestId: safeRequestId,
            claimHash: expectedClaimHash, payloadHash: expectedPayloadHash,
            revisionId: id(revision)
          }
        }
      });
      result = { idempotent: false, page, artifact, receipt };
    });
  } finally {
    await session.endSession();
  }
  return result;
};

const setResolutionCriteria = async ({
  userId, pageId, requestId, expectedClaim, criteria, horizonAt,
  WikiPage, WikiRevision, NoeisReceipt, now = () => new Date()
} = {}) => {
  const safeCriteria = clean(criteria, 2000);
  if (!safeCriteria) throw new JudgmentResolutionError('Write what would change your mind.');
  const current = now();
  const safeHorizon = asDate(horizonAt, 'horizonAt', { future: Boolean(horizonAt), now: current });
  const payload = { criteria: safeCriteria, horizonAt: safeHorizon?.toISOString() || null };
  return persistMutation({
    action: 'criteria', userId, pageId, requestId, expectedClaim, payload,
    WikiPage, WikiRevision, NoeisReceipt, now: () => current,
    mutate: ({ page, hash, actedAt, revisionId, receiptId: key }) => {
      const artifact = {
        criteria: safeCriteria, horizonAt: safeHorizon, setAt: actedAt,
        revisionId, receiptId: key, claimHash: hash
      };
      page.judgment.resolutionCriteria = safeCriteria;
      page.judgment.resolutionHorizonAt = safeHorizon;
      page.judgment.resolutionSetAt = actedAt;
      page.judgment.resolutionHistory.push(artifact);
      if (!Array.isArray(page.judgment.clocks)) page.judgment.clocks = [];
      page.judgment.clocks.push({
        ...clockFact({
          clock: 'expectation',
          occurredAt: safeHorizon,
          recordedAt: actedAt,
          precision: safeHorizon ? 'day' : 'unknown',
          authoredBy: 'user',
          summary: safeCriteria,
          relatedId: key,
          receiptId: key,
          revisionId,
          claimHash: hash
        })
      });
      return artifact;
    }
  });
};

const recordVerdict = async ({
  userId, pageId, requestId, expectedClaim, result, note = '', evidenceSourceRefIds = [],
  WikiPage, WikiRevision, NoeisReceipt, now = () => new Date()
} = {}) => {
  const safeResult = clean(result, 40);
  if (!RESULTS.has(safeResult)) throw new JudgmentResolutionError('Choose held up, broke, partly, unresolvable, or right for the wrong reasons.');
  const safeNote = clean(note, 4000);
  const payload = { result: safeResult, note: safeNote, evidenceSourceRefIds: unique(evidenceSourceRefIds).sort() };
  return persistMutation({
    action: 'verdict', userId, pageId, requestId, expectedClaim, payload,
    WikiPage, WikiRevision, NoeisReceipt, now,
    mutate: ({ page, hash, actedAt, revisionId, receiptId: key }) => {
      const evidenceIds = exactEvidence(page, evidenceSourceRefIds);
      const verdictId = `verdict_${digest(`${userId}:${pageId}:${requestId}`).slice(0, 24)}`;
      const core = {
        verdictId, result: safeResult, note: safeNote, evidenceSourceRefIds: evidenceIds,
        recordedAt: actedAt,
        criteriaSnapshot: clean(page.judgment.resolutionCriteria, 2000),
        horizonAtSnapshot: page.judgment.resolutionHorizonAt || null,
        claimHash: hash
      };
      const artifact = {
        ...core, recordHash: digest(core), revisionId, receiptId: key, recordedBy: 'user'
      };
      page.judgment.verdicts.push(artifact);
      if (!Array.isArray(page.judgment.clocks)) page.judgment.clocks = [];
      page.judgment.clocks.push({
        ...clockFact({
          clock: 'review',
          occurredAt: actedAt,
          recordedAt: actedAt,
          authoredBy: 'user',
          sourceRefIds: evidenceIds,
          summary: safeResult.replace(/_/g, ' '),
          relatedId: verdictId,
          receiptId: key,
          revisionId,
          claimHash: hash
        })
      });
      evidenceIds.forEach((sourceId) => {
        page.judgment.clocks.push({
          ...clockFact({
            clock: 'evidence',
            occurredAt: actedAt,
            recordedAt: actedAt,
            authoredBy: 'user',
            sourceRefIds: [sourceId],
            summary: 'Named as evidence for this verdict.',
            relatedId: `${verdictId}:${sourceId}`,
            receiptId: key,
            revisionId,
            claimHash: hash
          })
        });
      });
      return artifact;
    }
  });
};

const fileJudgmentEvidence = async ({
  userId, pageId, requestId, expectedClaim, field, articleId, highlightId,
  WikiPage, WikiRevision, NoeisReceipt, Article, now = () => new Date()
} = {}) => {
  const safeField = clean(field, 20);
  const safeArticleId = id(articleId);
  const safeHighlightId = id(highlightId);
  if (!EVIDENCE_FIELDS.has(safeField)) {
    throw new JudgmentResolutionError('Choose Why or Against for this passage.');
  }
  if (!objectId(safeArticleId) || !objectId(safeHighlightId)) {
    throw new JudgmentResolutionError('articleId and highlightId must be valid object ids.');
  }
  if (!Article?.findOne) {
    throw new JudgmentResolutionError('Library evidence is unavailable.', 503, 'unavailable');
  }
  const payload = { field: safeField, articleId: safeArticleId, highlightId: safeHighlightId };
  return persistMutation({
    action: 'evidence', userId, pageId, requestId, expectedClaim, payload,
    WikiPage, WikiRevision, NoeisReceipt, now,
    mutate: async ({ page, hash, actedAt, revisionId, receiptId: key, session }) => {
      const article = await resolveQuery(queryInSession(Article.findOne({
        _id: safeArticleId,
        userId,
        'highlights._id': safeHighlightId
      }), session));
      const highlight = list(article?.highlights)
        .find(candidate => id(candidate) === safeHighlightId);
      const text = clean(highlight?.text, 8000);
      if (!article || !highlight || !text) {
        throw new JudgmentResolutionError('That saved passage no longer resolves in your Library.', 409, 'unresolved_evidence');
      }
      const origin = `highlight:${safeArticleId}:${safeHighlightId}`;
      const reasons = [...list(page?.judgment?.why), ...list(page?.judgment?.against)];
      if (reasons.some(reason => clean(reason?.acceptedFrom, 300) === origin)) {
        throw new JudgmentResolutionError('That passage is already filed on this judgment.', 409, 'evidence_already_filed');
      }
      const responseId = `evidence_${digest(`${userId}:${pageId}:${requestId}`).slice(0, 24)}`;
      const reasonId = `reason_${digest(`${responseId}:${safeField}`).slice(0, 24)}`;
      page.judgment[safeField] = list(page.judgment[safeField]);
      page.judgment[safeField].push({
        reasonId,
        text,
        sourceRefIds: [],
        sourceLabel: clean(article.title, 500),
        acceptedFrom: origin,
        createdAt: actedAt
      });
      const arrivedAt = highlight.createdAt ? new Date(highlight.createdAt) : null;
      const sourceArrivedAt = arrivedAt && !Number.isNaN(arrivedAt.getTime()) ? arrivedAt : null;
      const artifact = {
        responseId,
        reasonId,
        field: safeField,
        articleId: safeArticleId,
        highlightId: safeHighlightId,
        sourceArrivedAt,
        respondedAt: actedAt,
        claimHash: hash,
        revisionId,
        receiptId: key,
        text
      };
      page.judgment.evidenceResponses = list(page.judgment.evidenceResponses);
      page.judgment.evidenceResponses.push(artifact);
      return artifact;
    }
  });
};

module.exports = {
  JudgmentResolutionError,
  EVIDENCE_FIELDS,
  RESULTS,
  claimHash,
  fileJudgmentEvidence,
  recordVerdict,
  setResolutionCriteria
};
